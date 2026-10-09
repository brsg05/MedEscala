import { createHash } from 'node:crypto';
import {
  formatarCentavos,
  formatarDataHora,
  type PapelNoTermo,
  type TipoTermo,
} from '@medescala/contracts';

/**
 * O conteúdo de um termo (F13), sem banco — DEC-184 a DEC-187.
 *
 * Tudo aqui é função pura: o mesmo dado produz o mesmo retrato e o mesmo hash,
 * em qualquer máquina. É isso que permite gerar o PDF sob demanda e ainda dizer
 * "este é o documento que as partes aceitaram".
 */

/** Versão do modelo de texto. Muda quando as cláusulas mudam; termos antigos guardam a sua. */
export const VERSAO_DO_MODELO = 2;

export interface Parte {
  papel: PapelNoTermo;
  nome: string;
  /** "CRM/PE 12345" ou "CNPJ 12.345.678/0001-90". */
  registro: string;
}

export interface PlantaoDoTermo {
  id: string;
  setor: string;
  unidade: string;
  instituicao: string;
  inicio: string;
  fim: string;
  valorCentavos: number;
  especialidade: string;
  modeloContratacao: string;
}

export interface ConteudoDoTermo {
  tipo: TipoTermo;
  versaoDoModelo: number;
  emitidoEm: string;
  plantao: PlantaoDoTermo;
  partes: Parte[];
  repasse: { id: string; motivo: string; modeloFiscal: string } | null;
  clausulas: string[];
}

/** Quem precisa assinar cada tipo de termo. */
export const PAPEIS_DO_TERMO: Readonly<Record<TipoTermo, readonly PapelNoTermo[]>> = {
  CONTRATO_PLANTAO: ['MEDICO', 'INSTITUICAO'],
  SUBSTITUICAO: ['TITULAR', 'SUBSTITUTO', 'INSTITUICAO'],
};

/**
 * JSON canônico: chaves em ordem, sem espaços. O JSONB do Postgres reordena as
 * chaves ao guardar; com a ordem fixada aqui, o hash recalculado do que voltou
 * do banco é o mesmo da emissão.
 */
export function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor);
  }
  if (Array.isArray(valor)) {
    return `[${valor.map(canonico).join(',')}]`;
  }
  const obj = valor as Record<string, unknown>;
  const chaves = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonico(obj[k])}`).join(',')}}`;
}

export function hashDe(conteudo: ConteudoDoTermo): string {
  return createHash('sha256').update(canonico(conteudo), 'utf8').digest('hex');
}

export function registroDeCrm(crm: string, crmUf: string): string {
  return `CRM/${crmUf} ${crm}`;
}

export function registroDeCnpj(cnpj: string): string {
  return `CNPJ ${cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/u, '$1.$2.$3/$4-$5')}`;
}

function quando(p: PlantaoDoTermo): string {
  return `${formatarDataHora(p.inicio)} a ${formatarDataHora(p.fim)}`;
}

/** Contrato entre o médico escalado e a instituição. */
export function montarContrato(dados: {
  plantao: PlantaoDoTermo;
  medico: Parte;
  instituicao: Parte;
  prazoContestacaoHoras: number;
  emitidoEm: Date;
}): ConteudoDoTermo {
  const { plantao: p } = dados;
  return {
    tipo: 'CONTRATO_PLANTAO',
    versaoDoModelo: VERSAO_DO_MODELO,
    emitidoEm: dados.emitidoEm.toISOString(),
    plantao: p,
    partes: [dados.medico, dados.instituicao],
    repasse: null,
    clausulas: [
      `Objeto. ${dados.medico.nome} presta serviço médico em ${p.especialidade} no plantão de ${p.setor} (${p.unidade}, ${p.instituicao}), de ${quando(p)}.`,
      `Valor. A instituição paga ${formatarCentavos(p.valorCentavos)} pelo plantão cumprido, com as retenções legais aplicáveis. O valor fica retido até o fim do prazo de contestação e então é liberado ao médico.`,
      `Execução. O cumprimento é registrado por check-in e check-out no MedEscala. A instituição pode contestar o plantão em até ${String(dados.prazoContestacaoHoras)} horas após o check-out, com justificativa; o médico pode responder antes da decisão.`,
      'Substituição. O médico só deixa de responder pelo plantão com um repasse aprovado pela instituição. Até a aprovação, a responsabilidade continua sendo dele.',
      `Natureza. Prestação de serviço sem vínculo empregatício, na modalidade ${p.modeloContratacao}.`,
      'Assinatura. As partes aceitaram este termo por ação registrada no MedEscala, com data, hora e hash do conteúdo. É um aceite simulado, que não substitui assinatura com certificado digital.',
    ],
  };
}

/** Termo de substituição: titular, substituto e instituição (repasse aprovado). */
export function montarSubstituicao(dados: {
  plantao: PlantaoDoTermo;
  titular: Parte;
  substituto: Parte;
  instituicao: Parte;
  repasse: { id: string; motivo: string; modeloFiscal: string };
  aprovadoEm: Date;
  emitidoEm: Date;
}): ConteudoDoTermo {
  const { plantao: p } = dados;
  const modelo =
    dados.repasse.modeloFiscal === 'A_RECONTRATACAO'
      ? 'Modelo A, recontratação: a instituição contrata e paga diretamente o substituto.'
      : 'Modelo B, subcontratação: o titular contrata o substituto e responde perante a instituição.';
  return {
    tipo: 'SUBSTITUICAO',
    versaoDoModelo: VERSAO_DO_MODELO,
    emitidoEm: dados.emitidoEm.toISOString(),
    plantao: p,
    partes: [dados.titular, dados.substituto, dados.instituicao],
    repasse: dados.repasse,
    clausulas: [
      `Objeto. ${dados.titular.nome} transfere a ${dados.substituto.nome} a execução do plantão de ${p.setor} (${p.unidade}, ${p.instituicao}), de ${quando(p)}, no valor de ${formatarCentavos(p.valorCentavos)}.`,
      `Aprovação. A transferência só produz efeito com a aprovação da instituição, registrada em ${formatarDataHora(dados.aprovadoEm)}. Antes dela, o titular respondia pelo plantão.`,
      `Responsabilidade. A partir da aprovação, ${dados.substituto.nome} é o executante e o responsável pelo plantão perante a instituição.`,
      `Modelo fiscal. ${modelo}`,
      `Motivo declarado pelo titular: "${dados.repasse.motivo.replace(/[.\s]+$/u, '')}".`,
      'Assinatura. As partes aceitaram este termo por ação registrada no MedEscala, com data, hora e hash do conteúdo. É um aceite simulado, que não substitui assinatura com certificado digital.',
    ],
  };
}
