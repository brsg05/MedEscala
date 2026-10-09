import { z } from 'zod';
import { InstanteUtc } from './datahora.js';

/**
 * F16 — confirmação de execução (DEC-130 a DEC-134, ADR-020).
 *
 * O executante faz check-in e check-out; a instituição pode contestar até
 * `contestavelAte`. Plantão que termina sem confirmação (DEC-131) não é um
 * estado novo: é `semConfirmacao`, derivado do horário — nada é presumido.
 */

/** DEC-133 — o check-in abre 30 minutos antes do início. */
export const ANTECEDENCIA_DO_CHECKIN_MS = 30 * 60_000;

export const ResultadoContestacao = z.enum(['IMPROCEDENTE', 'PROCEDENTE']);
export type ResultadoContestacao = z.infer<typeof ResultadoContestacao>;

export const ROTULO_RESULTADO_CONTESTACAO: Readonly<Record<ResultadoContestacao, string>> = {
  IMPROCEDENTE: 'Mantido como cumprido',
  PROCEDENTE: 'Plantão cancelado',
};

export const ContestacaoResponse = z.strictObject({
  justificativa: z.string(),
  abertaEm: InstanteUtc,
  resposta: z.string().nullable(),
  respondidaEm: InstanteUtc.nullable(),
  resultado: ResultadoContestacao.nullable(),
  nota: z.string().nullable(),
  resolvidaEm: InstanteUtc.nullable(),
});
export type ContestacaoResponse = z.infer<typeof ContestacaoResponse>;

export const ExecucaoResponse = z.strictObject({
  checkinEm: InstanteUtc.nullable(),
  checkoutEm: InstanteUtc.nullable(),
  /** Até quando a instituição pode contestar o check-out (DEC-132). */
  contestavelAte: InstanteUtc.nullable(),
  /** Terminou e ninguém confirmou: a instituição decide (DEC-131). */
  semConfirmacao: z.boolean(),
  contestacao: ContestacaoResponse.nullable(),
});
export type ExecucaoResponse = z.infer<typeof ExecucaoResponse>;

const TextoJustificado = (mensagem: string) =>
  z.string().trim().min(10, mensagem).max(1000, 'Use no máximo 1000 caracteres');

export const ContestarPlantaoRequest = z.strictObject({
  justificativa: TextoJustificado('A contestação exige justificativa'),
});
export type ContestarPlantaoRequest = z.infer<typeof ContestarPlantaoRequest>;

export const ResponderContestacaoRequest = z.strictObject({
  resposta: TextoJustificado('Escreva a sua versão (ao menos 10 caracteres)'),
});
export type ResponderContestacaoRequest = z.infer<typeof ResponderContestacaoRequest>;

export const ResolverContestacaoRequest = z.strictObject({
  resultado: ResultadoContestacao,
  nota: TextoJustificado('Registre o motivo da decisão'),
});
export type ResolverContestacaoRequest = z.infer<typeof ResolverContestacaoRequest>;
