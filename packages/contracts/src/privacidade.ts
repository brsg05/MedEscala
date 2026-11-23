import { z } from 'zod';
import { InstanteUtc } from './datahora.js';

/**
 * F24 — consentimento e privacidade, versão mínima (ADR-015).
 *
 * A política mora aqui, versionada como as regras fiscais (§3.2): versão nova
 * entra como item novo da lista, nunca editando a anterior no lugar — quem
 * aceitou a v1 aceitou AQUELE texto, e o hash gravado no aceite precisa
 * continuar conferindo.
 *
 * O que ESTÁ dentro da versão mínima: finalidade declarada por tipo de dado,
 * base legal, política de retenção escrita e registro do aceite por versão.
 *
 * O que fica FORA (ADR-015): atendimento automatizado aos direitos do titular
 * (acesso, correção, eliminação). A eliminação colide com a trilha append-only
 * (ADR-007) e exige pseudonimização ou crypto-shredding. Até lá, o pedido é
 * atendido pelo canal do encarregado, fora do sistema.
 *
 * Os PRAZOS de retenção são `provisórios` (DEC-226): a retenção era decisão em
 * aberto no changelog. Valem até a equipe revisar.
 */

export interface ItemDaPolitica {
  /** Categoria de dado, como aparece para o titular. */
  categoria: string;
  /** Quais campos entram na categoria. */
  dados: string;
  finalidade: string;
  /** Hipótese do art. 7º da LGPD (Lei 13.709/2018). */
  baseLegal: string;
  retencao: string;
}

export interface VersaoDaPolitica {
  /** Identificador estável; é o que o aceite registra. */
  versao: string;
  vigenteDesde: string;
  resumo: string;
  itens: readonly ItemDaPolitica[];
  /** Compromissos que não são por tipo de dado. */
  compromissos: readonly string[];
}

export const POLITICAS_DE_PRIVACIDADE: readonly VersaoDaPolitica[] = [
  {
    versao: '2026-11-v1',
    vigenteDesde: '2026-11-23',
    resumo:
      'O MedEscala intermedeia plantões e repasses entre médicos e instituições. ' +
      'Coletamos só o necessário para escalar, formalizar e pagar o plantão, ' +
      'e não coletamos dado clínico nem dado de paciente.',
    itens: [
      {
        categoria: 'Conta',
        dados: 'Nome, e-mail e senha (a senha fica só com o provedor de autenticação, cifrada)',
        finalidade: 'Identificar quem usa a plataforma e manter a sessão',
        baseLegal: 'Execução de contrato (art. 7º, V)',
        retencao: 'Enquanto a conta existir',
      },
      {
        categoria: 'Registro profissional',
        dados: 'CRM, UF do CRM e especialidade',
        finalidade:
          'Conferir a regularidade do médico antes de escalá-lo e cruzar a especialidade com a vaga',
        baseLegal: 'Execução de contrato (art. 7º, V)',
        retencao: 'Enquanto a conta existir',
      },
      {
        categoria: 'Dados fiscais',
        dados: 'CNPJ, regime tributário e inscrição municipal',
        finalidade: 'Calcular retenções e preparar o documento fiscal do plantão',
        baseLegal: 'Cumprimento de obrigação legal (art. 7º, II)',
        retencao: '5 anos após o último documento fiscal emitido',
      },
      {
        categoria: 'Dados bancários',
        dados: 'Banco, agência, conta ou chave Pix — guardados cifrados',
        finalidade: 'Pagar o plantão executado',
        baseLegal: 'Execução de contrato (art. 7º, V)',
        retencao:
          'Enquanto a conta existir; podem ser apagados pelo próprio médico a qualquer momento',
      },
      {
        categoria: 'Disponibilidade e escala',
        dados: 'Janelas de disponibilidade, plantões, convites, repasses e check-in/check-out',
        finalidade: 'Montar a escala, propor substitutos e confirmar a execução',
        baseLegal: 'Execução de contrato (art. 7º, V)',
        retencao: '5 anos após o plantão',
      },
      {
        categoria: 'Termos, pagamentos e documentos fiscais',
        dados: 'Termos assinados no app, pagamentos e notas',
        finalidade: 'Formalizar o plantão e comprovar o pagamento',
        baseLegal:
          'Cumprimento de obrigação legal (art. 7º, II) e exercício regular de direitos (art. 7º, VI)',
        retencao: '5 anos após o plantão',
      },
      {
        categoria: 'Trilha de auditoria',
        dados: 'Quem fez o quê e quando, nas ações do sistema',
        finalidade: 'Comprovar o que aconteceu num plantão ou repasse, em caso de disputa',
        baseLegal: 'Exercício regular de direitos (art. 7º, VI)',
        retencao: '5 anos após o evento; o registro não pode ser alterado',
      },
      {
        categoria: 'Ocorrências',
        dados: 'Cancelamentos fora do prazo e outras ocorrências do plantão',
        finalidade: 'Informar a instituição sobre o histórico de comparecimento',
        baseLegal: 'Legítimo interesse (art. 7º, IX)',
        retencao: '2 anos após a ocorrência',
      },
    ],
    compromissos: [
      'Não coletamos nem armazenamos dados clínicos ou dados de pacientes.',
      'Não vendemos nem cedemos dados pessoais para publicidade.',
      'A instituição só vê os médicos que se ofereceram para o horário dela.',
      'Pedidos de acesso, correção ou eliminação de dados são atendidos pelo encarregado da plataforma.',
    ],
  },
];

/** A versão mais recente cuja vigência já começou. */
export function politicaVigente(data: Date = new Date()): VersaoDaPolitica {
  const dia = data.toISOString().slice(0, 10);
  const vigente = [...POLITICAS_DE_PRIVACIDADE]
    .filter((p) => p.vigenteDesde <= dia)
    .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0];

  if (vigente === undefined) {
    throw new Error(`Nenhuma política de privacidade vigente em ${dia}`);
  }
  return vigente;
}

export function politicaPorVersao(versao: string): VersaoDaPolitica | undefined {
  return POLITICAS_DE_PRIVACIDADE.find((p) => p.versao === versao);
}

/**
 * Texto canônico da versão, em JSON de chaves ordenadas. É sobre ele que a api
 * calcula o hash gravado no aceite: mudar uma vírgula de uma versão publicada
 * faz o hash parar de conferir — e o teste da política falha.
 */
export function textoCanonicoDaPolitica(p: VersaoDaPolitica): string {
  return JSON.stringify(ordenar(p));
}

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(ordenar);
  }
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, ordenar(v)]),
    );
  }
  return valor;
}

// --- API ---------------------------------------------------------------------

export const ItemDaPoliticaSchema = z.strictObject({
  categoria: z.string(),
  dados: z.string(),
  finalidade: z.string(),
  baseLegal: z.string(),
  retencao: z.string(),
});

export const PoliticaResponse = z.strictObject({
  versao: z.string(),
  vigenteDesde: z.string(),
  resumo: z.string(),
  itens: z.array(ItemDaPoliticaSchema),
  compromissos: z.array(z.string()),
  /** SHA-256 do texto canônico — o mesmo que fica gravado no aceite. */
  hash: z.string().length(64),
});
export type PoliticaResponse = z.infer<typeof PoliticaResponse>;

export const SituacaoDoAceiteResponse = z.strictObject({
  versaoVigente: z.string(),
  /** Última versão aceita por este usuário; nula se nunca aceitou. */
  versaoAceita: z.string().nullable(),
  aceitoEm: InstanteUtc.nullable(),
  /** Verdadeiro enquanto o usuário não aceitar a versão vigente. */
  pendente: z.boolean(),
});
export type SituacaoDoAceiteResponse = z.infer<typeof SituacaoDoAceiteResponse>;

export const AceitarPoliticaRequest = z.strictObject({
  /** A versão que o usuário leu. Precisa ser a vigente. */
  versao: z.string().min(1).max(40),
});
export type AceitarPoliticaRequest = z.infer<typeof AceitarPoliticaRequest>;
