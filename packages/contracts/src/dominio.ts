import { z } from 'zod';
import { Centavos } from './dinheiro.js';
import { InstanteUtc } from './datahora.js';
import { ExecucaoResponse } from './execucao.js';

/**
 * Contratos do domínio — Sprints 1 a 3.
 *
 * Espelham os enums do schema Prisma. Quando um valor for adicionado num lado,
 * precisa ser adicionado no outro: é duplicação inevitável na fronteira entre
 * banco e wire, mas concentrada em um arquivo só.
 */

// --- enums -------------------------------------------------------------------

export const StatusPlantao = z.enum([
  'ABERTO',
  'EM_SELECAO',
  'CONFIRMADO',
  'EM_REPASSE',
  'EM_EXECUCAO',
  'EXECUTADO',
  'LIQUIDADO',
  'CONTESTADO',
  'CANCELADO',
]);
export type StatusPlantao = z.infer<typeof StatusPlantao>;

export const StatusRepasse = z.enum([
  'SOLICITADO',
  'SUBSTITUTO_ACEITO',
  'AGUARDANDO_APROVACAO',
  'APROVADO',
  'RECUSADO_SUBSTITUTO',
  'RECUSADO_INSTITUICAO',
  'CANCELADO',
]);
export type StatusRepasse = z.infer<typeof StatusRepasse>;

export const ModeloContratacao = z.enum(['PJ', 'RPA']);
export type ModeloContratacao = z.infer<typeof ModeloContratacao>;

export const ModeloFiscal = z.enum(['A_RECONTRATACAO', 'B_SUBCONTRATACAO']);
export type ModeloFiscal = z.infer<typeof ModeloFiscal>;

export const RegimeTributario = z.enum(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL']);
export type RegimeTributario = z.infer<typeof RegimeTributario>;

/** Como o estado do plantão aparece na régua de cobertura do web. */
export const ROTULO_STATUS_PLANTAO: Record<StatusPlantao, string> = {
  ABERTO: 'Vaga aberta',
  EM_SELECAO: 'Em seleção',
  CONFIRMADO: 'Confirmado',
  EM_REPASSE: 'Em repasse',
  EM_EXECUCAO: 'Em execução',
  EXECUTADO: 'Executado',
  LIQUIDADO: 'Liquidado',
  CONTESTADO: 'Contestado',
  CANCELADO: 'Cancelado',
};

export const ROTULO_STATUS_REPASSE: Record<StatusRepasse, string> = {
  SOLICITADO: 'Procurando substituto',
  SUBSTITUTO_ACEITO: 'Substituto aceitou',
  AGUARDANDO_APROVACAO: 'Aguardando a chefia',
  APROVADO: 'Aprovado',
  RECUSADO_SUBSTITUTO: 'Recusado pelo substituto',
  RECUSADO_INSTITUICAO: 'Recusado pela instituição',
  CANCELADO: 'Cancelado',
};

// --- F01 / F02 — médico ------------------------------------------------------

/**
 * CRM validado por FORMATO apenas (§3.1): o CFM não expõe API pública, e a
 * regularidade é atestada por conferência manual do operador da plataforma.
 * A RN02 depende do campo `verificado`, não deste formato.
 */
export const Crm = z
  .string()
  .trim()
  .regex(/^\d{4,10}$/u, 'CRM deve conter de 4 a 10 dígitos');

export const UfBrasileira = z.enum([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]);
export type UfBrasileira = z.infer<typeof UfBrasileira>;

export const Cnpj = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/gu, ''))
  .pipe(z.string().length(14, 'CNPJ deve ter 14 dígitos'));

export const CriarMedicoRequest = z.strictObject({
  crm: Crm,
  crmUf: UfBrasileira,
  especialidade: z.string().trim().min(3).max(120),
});
export type CriarMedicoRequest = z.infer<typeof CriarMedicoRequest>;

/** F02 — parte fiscal. Dados bancários ficam para o Sprint 4 (RNF07). */
export const DadosFiscaisRequest = z.strictObject({
  cnpj: Cnpj.nullable(),
  regimeTributario: RegimeTributario.nullable(),
  inscricaoMunicipal: z.string().trim().max(30).nullable(),
});
export type DadosFiscaisRequest = z.infer<typeof DadosFiscaisRequest>;

export const MedicoResponse = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  crm: z.string(),
  crmUf: z.string(),
  especialidade: z.string(),
  verificado: z.boolean(),
  cnpj: z.string().nullable(),
  regimeTributario: RegimeTributario.nullable(),
  inscricaoMunicipal: z.string().nullable(),
});
export type MedicoResponse = z.infer<typeof MedicoResponse>;

// --- F04 — disponibilidade ---------------------------------------------------

export const CriarDisponibilidadeRequest = z
  .strictObject({
    inicio: InstanteUtc,
    fim: InstanteUtc,
    valorMinimoCentavos: Centavos.nullable(),
  })
  .refine((j) => Date.parse(j.inicio) < Date.parse(j.fim), {
    message: 'O fim da janela deve ser posterior ao início',
    path: ['fim'],
  });
export type CriarDisponibilidadeRequest = z.infer<typeof CriarDisponibilidadeRequest>;

export const DisponibilidadeResponse = z.strictObject({
  id: z.uuid(),
  inicio: InstanteUtc,
  fim: InstanteUtc,
  valorMinimoCentavos: z.number().int().nullable(),
});
export type DisponibilidadeResponse = z.infer<typeof DisponibilidadeResponse>;

// --- F03 — instituição, unidade, setor, escala -------------------------------

export const CriarInstituicaoRequest = z.strictObject({
  nome: z.string().trim().min(3).max(200),
  cnpj: Cnpj,
  antecedenciaMinimaRepasseHoras: z.number().int().min(0).max(720).optional(),
  validadeConviteHoras: z.number().int().min(1).max(720).optional(),
});
export type CriarInstituicaoRequest = z.infer<typeof CriarInstituicaoRequest>;

export const CriarUnidadeRequest = z.strictObject({
  nome: z.string().trim().min(3).max(200),
  cnes: z
    .string()
    .trim()
    .regex(/^\d{7}$/u, 'CNES deve ter 7 dígitos')
    .nullable(),
});
export type CriarUnidadeRequest = z.infer<typeof CriarUnidadeRequest>;

export const CriarSetorRequest = z.strictObject({
  nome: z.string().trim().min(2).max(120),
  especialidadeExigida: z.string().trim().min(3).max(120),
});
export type CriarSetorRequest = z.infer<typeof CriarSetorRequest>;

/** Competência da escala no formato `AAAA-MM`. */
export const Competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u, 'Use o formato AAAA-MM');

// --- F06 — publicar vaga de plantão ------------------------------------------

export const CriarPlantaoRequest = z
  .strictObject({
    setorId: z.uuid(),
    inicio: InstanteUtc,
    fim: InstanteUtc,
    valorCentavos: Centavos,
    especialidadeExigida: z.string().trim().min(3).max(120),
    requisitos: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    modeloContratacao: ModeloContratacao,
  })
  .refine((p) => Date.parse(p.inicio) < Date.parse(p.fim), {
    message: 'O fim do plantão deve ser posterior ao início',
    path: ['fim'],
  });
export type CriarPlantaoRequest = z.infer<typeof CriarPlantaoRequest>;

export const MedicoResumo = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  crm: z.string(),
  crmUf: z.string(),
});
export type MedicoResumo = z.infer<typeof MedicoResumo>;

export const PlantaoResponse = z.strictObject({
  id: z.uuid(),
  inicio: InstanteUtc,
  fim: InstanteUtc,
  valorCentavos: z.number().int(),
  especialidadeExigida: z.string(),
  requisitos: z.array(z.string()),
  modeloContratacao: ModeloContratacao,
  status: StatusPlantao,
  setor: z.strictObject({
    id: z.uuid(),
    nome: z.string(),
    unidade: z.string(),
    instituicao: z.string(),
  }),
  titular: MedicoResumo.nullable(),
  executante: MedicoResumo.nullable(),
  /** F16 — check-in, check-out e contestação. */
  execucao: ExecucaoResponse,
});
export type PlantaoResponse = z.infer<typeof PlantaoResponse>;

/**
 * F05 — agenda unificada.
 *
 * `alertaCargaHoraria` é a metade não-bloqueante da RN03: a plataforma avisa que
 * a sequência passa de 24h, mas não impede. Impedir seria definir jornada, o que
 * a RN09 proíbe.
 */
export const AgendaResponse = z.strictObject({
  plantoes: z.array(PlantaoResponse),
  alertaCargaHoraria: z
    .strictObject({
      horasContiguas: z.number(),
      limite: z.number(),
    })
    .nullable(),
});
export type AgendaResponse = z.infer<typeof AgendaResponse>;

// --- F07 / F11 — repasse -----------------------------------------------------

/**
 * F07 — pedido de repasse, com a indicação do substituto (DEC-087).
 *
 * - `indicados` com até 5 médicos: Forma 1, convidados em FILA, na ordem dada
 *   (DEC-089). Podem vir da lista de quem se ofereceu ou de apontamento por CRM.
 * - `indicados` vazio: Forma 2, convite aberto — o matching escolhe os 5 mais
 *   bem colocados e os põe na mesma fila (DEC-094).
 */
export const AbrirRepasseRequest = z.strictObject({
  motivo: z.string().trim().min(10, 'Descreva o motivo em ao menos 10 caracteres').max(500),
  modeloFiscal: ModeloFiscal.default('A_RECONTRATACAO'),
  indicados: z
    .array(z.uuid())
    .max(5, 'Indique no máximo 5 pessoas')
    .refine((ids) => new Set(ids).size === ids.length, 'A mesma pessoa foi indicada duas vezes')
    .default([]),
});
export type AbrirRepasseRequest = z.infer<typeof AbrirRepasseRequest>;

/** Quando a fila volta ao titular (DEC-096), ele pode indicar mais gente. */
export const IndicarSubstitutosRequest = z.strictObject({
  indicados: z
    .array(z.uuid())
    .min(1, 'Indique ao menos uma pessoa')
    .max(5, 'Indique no máximo 5 pessoas')
    .refine((ids) => new Set(ids).size === ids.length, 'A mesma pessoa foi indicada duas vezes'),
});
export type IndicarSubstitutosRequest = z.infer<typeof IndicarSubstitutosRequest>;

export const StatusConvite = z.enum([
  'NA_FILA',
  'ATIVO',
  'ACEITO',
  'RECUSADO',
  'EXPIRADO',
  'CANCELADO',
]);
export type StatusConvite = z.infer<typeof StatusConvite>;

export const OrigemConvite = z.enum(['INDICACAO', 'MATCHING']);
export type OrigemConvite = z.infer<typeof OrigemConvite>;

export const ROTULO_STATUS_CONVITE: Record<StatusConvite, string> = {
  NA_FILA: 'Na fila',
  ATIVO: 'Convidado agora',
  ACEITO: 'Aceitou',
  RECUSADO: 'Recusou',
  EXPIRADO: 'Prazo venceu',
  CANCELADO: 'Não chegou a vez',
};

export const RecusarRepasseRequest = z.strictObject({
  justificativa: z.string().trim().min(10, 'A recusa exige justificativa').max(500),
});
export type RecusarRepasseRequest = z.infer<typeof RecusarRepasseRequest>;

export const RepasseResponse = z.strictObject({
  id: z.uuid(),
  plantaoId: z.uuid(),
  status: StatusRepasse,
  motivo: z.string(),
  modeloFiscal: ModeloFiscal,
  titular: MedicoResumo,
  substituto: MedicoResumo.nullable(),
  /** Quem está com o convite agora, e até quando (DEC-089). */
  convidadoDaVez: MedicoResumo.nullable(),
  prazoConviteAte: InstanteUtc.nullable(),
  origemConvite: OrigemConvite.nullable(),
  /** A fila e o matching acabaram sem aceite; o repasse voltou ao titular (DEC-096). */
  filaEsgotada: z.boolean(),
  aprovadoEm: InstanteUtc.nullable(),
  justificativaRecusa: z.string().nullable(),
});
export type RepasseResponse = z.infer<typeof RepasseResponse>;

// --- F23 — trilha de auditoria -----------------------------------------------

export const EventoAuditoriaResponse = z.strictObject({
  /** `bigint` do Postgres serializado como string — JSON não tem inteiro de 64 bits. */
  id: z.string(),
  ocorridoEm: InstanteUtc,
  acao: z.string(),
  entidade: z.string(),
  entidadeId: z.string().nullable(),
  estadoAnterior: z.string().nullable(),
  estadoNovo: z.string().nullable(),
  atorId: z.uuid().nullable(),
});
export type EventoAuditoriaResponse = z.infer<typeof EventoAuditoriaResponse>;

/**
 * F12 — escalar um medico numa vaga.
 *
 * No fluxo completo isto viria de uma candidatura aceita (F10, Sprint 2). Ate
 * la, a chefia escala diretamente — que e como a escala e montada hoje nas
 * unidades, segundo o diagnostico da Entrega 1.
 */
export const AtribuirPlantaoRequest = z.strictObject({ medicoId: z.uuid() });
export type AtribuirPlantaoRequest = z.infer<typeof AtribuirPlantaoRequest>;

// --- listagens que as telas precisam -----------------------------------------

/**
 * O que espera uma decisao do usuario autenticado.
 *
 * O tipo depende do perfil, nao de um filtro que o cliente escolhe: o medico ve
 * convites para cobrir; a chefia ve substituicoes para aprovar. Deixar o cliente
 * pedir "me da as aprovacoes" abriria caminho para um medico listar decisoes que
 * nao sao dele.
 */
export const TipoDeDecisao = z.enum(['ACEITAR_CONVITE', 'APROVAR_SUBSTITUICAO']);
export type TipoDeDecisao = z.infer<typeof TipoDeDecisao>;

export const RepasseComPlantao = z.strictObject({
  repasse: RepasseResponse,
  plantao: PlantaoResponse,
});
export type RepasseComPlantao = z.infer<typeof RepasseComPlantao>;

export const DecisaoResponse = z.strictObject({
  tipo: TipoDeDecisao,
  repasse: RepasseResponse,
  plantao: PlantaoResponse,
});
export type DecisaoResponse = z.infer<typeof DecisaoResponse>;

// --- cadastro aberto (DEC-059) ----------------------------------------------

/**
 * Cadastro aberto, provisório (DEC-059): o produto deve virar multi-tenant, com o
 * operador da plataforma incluindo a instituição. Até lá:
 *
 * - o médico se cadastra e nasce NÃO VERIFICADO (RN02);
 * - quem cadastra uma instituição recebe ADMIN e CHEFIA (DEC-064), e a instituição
 *   nasce PENDENTE até o operador confirmar o CNPJ (DEC-063).
 */
const DadosDeConta = {
  nome: z.string().trim().min(3, 'Informe o nome completo').max(120),
  email: z.email('E-mail inválido'),
  senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
};

export const CadastroRequest = z.discriminatedUnion('tipo', [
  z.strictObject({
    tipo: z.literal('MEDICO'),
    ...DadosDeConta,
    crm: Crm,
    crmUf: UfBrasileira,
    especialidade: z.string().trim().min(3).max(120),
  }),
  z.strictObject({
    tipo: z.literal('INSTITUICAO'),
    ...DadosDeConta,
    instituicaoNome: z.string().trim().min(3).max(200),
    cnpj: Cnpj,
  }),
]);
export type CadastroRequest = z.infer<typeof CadastroRequest>;

// --- instituição: estrutura e verificação (DEC-063) --------------------------

export const StatusInstituicao = z.enum(['PENDENTE', 'ATIVA']);
export type StatusInstituicao = z.infer<typeof StatusInstituicao>;

export const InstituicaoResumo = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  cnpj: z.string(),
  status: StatusInstituicao,
});
export type InstituicaoResumo = z.infer<typeof InstituicaoResumo>;

export const SetorResumo = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  especialidadeExigida: z.string(),
});
export type SetorResumo = z.infer<typeof SetorResumo>;

export const EstruturaResponse = z.strictObject({
  instituicao: InstituicaoResumo.extend({
    prazoConviteRepasseMinutos: z.number().int(),
    prazoContestacaoHoras: z.number().int(),
  }),
  unidades: z.array(
    z.strictObject({
      id: z.uuid(),
      nome: z.string(),
      cnes: z.string().nullable(),
      setores: z.array(SetorResumo),
    }),
  ),
  chefias: z.array(z.strictObject({ usuarioId: z.uuid(), nome: z.string(), email: z.string() })),
});
export type EstruturaResponse = z.infer<typeof EstruturaResponse>;

/** DEC-064 — o admin concede chefia a um usuário que já tem conta. */
export const ConcederChefiaRequest = z.strictObject({ email: z.email('E-mail inválido') });
export type ConcederChefiaRequest = z.infer<typeof ConcederChefiaRequest>;

/**
 * DEC-062 — candidato a uma vaga.
 *
 * Só aparece quem declarou disponibilidade cobrindo o horário, está verificado,
 * tem a especialidade exigida e não tem conflito de agenda. É o filtro da F08
 * sem a ordenação da F09: a ordem é alfabética, porque a fórmula de ranking
 * ainda não foi definida.
 */
export const CandidatoResponse = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  crm: z.string(),
  crmUf: z.string(),
  especialidade: z.string(),
});
export type CandidatoResponse = z.infer<typeof CandidatoResponse>;

// --- operador da plataforma ---------------------------------------------------

/** O que espera conferência do operador: CNPJ de instituição e CRM de médico. */
export const PendenciasResponse = z.strictObject({
  instituicoes: z.array(InstituicaoResumo.extend({ criadaEm: InstanteUtc })),
  medicos: z.array(
    z.strictObject({
      id: z.uuid(),
      nome: z.string(),
      email: z.string(),
      crm: z.string(),
      crmUf: z.string(),
      especialidade: z.string(),
      criadoEm: InstanteUtc,
    }),
  ),
});
export type PendenciasResponse = z.infer<typeof PendenciasResponse>;

// --- fila de convites (DEC-087 a DEC-099) ------------------------------------

/** Um lugar na fila. Visível ao titular e à chefia, não aos outros convidados. */
export const ConviteResponse = z.strictObject({
  id: z.uuid(),
  ordem: z.number().int(),
  origem: OrigemConvite,
  status: StatusConvite,
  medico: MedicoResumo,
  prazoAte: InstanteUtc.nullable(),
  respondidoEm: InstanteUtc.nullable(),
});
export type ConviteResponse = z.infer<typeof ConviteResponse>;

/** DEC-091 — apontamento individual por CRM + UF exato; nunca por nome. */
export const BuscaPorCrmQuery = z.strictObject({ crm: Crm, uf: UfBrasileira });
export type BuscaPorCrmQuery = z.infer<typeof BuscaPorCrmQuery>;

/**
 * Prazos que o admin ajusta: o de cada convite da fila (DEC-090) e o de
 * contestação de um check-out (DEC-132). Manda só o que mudou.
 */
export const ConfiguracaoInstituicaoRequest = z
  .strictObject({
    prazoConviteRepasseMinutos: z
      .number()
      .int()
      .min(5, 'O prazo mínimo é de 5 minutos')
      .max(1440, 'O prazo máximo é de 24 horas')
      .optional(),
    prazoContestacaoHoras: z
      .number()
      .int()
      .min(1, 'O prazo mínimo é de 1 hora')
      .max(336, 'O prazo máximo é de 14 dias')
      .optional(),
  })
  .refine(
    (c) => c.prazoConviteRepasseMinutos !== undefined || c.prazoContestacaoHoras !== undefined,
    'Informe ao menos um prazo',
  );
export type ConfiguracaoInstituicaoRequest = z.infer<typeof ConfiguracaoInstituicaoRequest>;
