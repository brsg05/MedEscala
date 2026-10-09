import { z } from 'zod';
import { InstanteUtc } from './datahora.js';

/**
 * F13 — termos contratuais (DEC-184 a DEC-187).
 *
 * Assinatura simulada: a ação no app vale como aceite (DEC-185, `provisória`).
 * O termo guarda o retrato do conteúdo e o hash dele; o PDF sai desse retrato.
 */

export const TipoTermo = z.enum(['CONTRATO_PLANTAO', 'SUBSTITUICAO']);
export type TipoTermo = z.infer<typeof TipoTermo>;

export const ROTULO_TIPO_TERMO: Readonly<Record<TipoTermo, string>> = {
  CONTRATO_PLANTAO: 'Contrato do plantão',
  SUBSTITUICAO: 'Termo de substituição',
};

export const PapelNoTermo = z.enum(['MEDICO', 'TITULAR', 'SUBSTITUTO', 'INSTITUICAO']);
export type PapelNoTermo = z.infer<typeof PapelNoTermo>;

export const ROTULO_PAPEL_NO_TERMO: Readonly<Record<PapelNoTermo, string>> = {
  MEDICO: 'Médico',
  TITULAR: 'Titular',
  SUBSTITUTO: 'Substituto',
  INSTITUICAO: 'Instituição',
};

export const MetodoAssinatura = z.enum(['ACEITE_NO_APP']);
export type MetodoAssinatura = z.infer<typeof MetodoAssinatura>;

export const TermoResponse = z.strictObject({
  id: z.uuid(),
  tipo: TipoTermo,
  emitidoEm: InstanteUtc,
  /** SHA-256 do conteúdo congelado na emissão (DEC-187). */
  hash: z.string().length(64),
  /** Falso quando um repasse aprovado o substituiu. */
  vigente: z.boolean(),
  assinaturas: z.array(
    z.strictObject({
      papel: PapelNoTermo,
      nome: z.string(),
      registro: z.string().nullable(),
      metodo: MetodoAssinatura,
      /** A ação que valeu como assinatura (DEC-185). */
      acao: z.string(),
      assinadaEm: InstanteUtc,
    }),
  ),
  /** Quem ainda não assinou — no contrato da escala direta, o médico até o check-in. */
  pendentes: z.array(PapelNoTermo),
});
export type TermoResponse = z.infer<typeof TermoResponse>;
