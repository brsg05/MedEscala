import { z } from 'zod';
import { InstanteUtc } from './datahora.js';

/**
 * F10 — vaga aberta: convite pela fila + candidatura (DEC-135, DEC-164 a DEC-168).
 *
 * Os schemas que dependem de `PlantaoResponse` moram em `dominio.ts`; aqui fica
 * o que é só da candidatura.
 */

export const StatusCandidatura = z.enum([
  'PENDENTE',
  'ACEITA',
  'RECUSADA',
  'RETIRADA',
  'ENCERRADA',
]);
export type StatusCandidatura = z.infer<typeof StatusCandidatura>;

export const ROTULO_STATUS_CANDIDATURA: Readonly<Record<StatusCandidatura, string>> = {
  PENDENTE: 'Candidatura enviada',
  ACEITA: 'Escolhido',
  RECUSADA: 'Não escolhido',
  RETIRADA: 'Candidatura retirada',
  ENCERRADA: 'Vaga preenchida',
};

/** Quem se candidatou, como a chefia vê. */
export const CandidaturaResponse = z.strictObject({
  id: z.uuid(),
  status: StatusCandidatura,
  medico: z.strictObject({
    id: z.uuid(),
    nome: z.string(),
    crm: z.string(),
    crmUf: z.string(),
    especialidade: z.string(),
  }),
  criadaEm: InstanteUtc,
});
export type CandidaturaResponse = z.infer<typeof CandidaturaResponse>;

/**
 * A chefia convida pela fila (DEC-135): até 5 indicados, na ordem; sem
 * indicação, o matching chama em lotes.
 */
export const ConvidarParaVagaRequest = z.strictObject({
  indicados: z
    .array(z.uuid())
    .max(5, 'Indique no máximo 5 pessoas')
    .refine((ids) => new Set(ids).size === ids.length, 'A mesma pessoa foi indicada duas vezes')
    .default([]),
});
export type ConvidarParaVagaRequest = z.infer<typeof ConvidarParaVagaRequest>;

/** DEC-166 — por padrão as compatíveis; `todas=true` mostra o resto. */
export const VagasQuery = z.strictObject({
  todas: z.enum(['true', 'false']).optional(),
});
export type VagasQuery = z.infer<typeof VagasQuery>;
