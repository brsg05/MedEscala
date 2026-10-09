import { z } from 'zod';
import { InstanteUtc } from './datahora.js';

/**
 * F22 — notificações in-app (DEC-121, DEC-127 a DEC-129).
 *
 * Entregues por polling (DEC-127): o web consulta `GET /notificacoes` a cada
 * ~20s e ao voltar para a aba. Sem WebSocket nem Realtime, para o BFF continuar
 * sendo a única porta (D2) e funcionar em hospedagem serverless.
 */
export const TipoNotificacao = z.enum([
  // fila do repasse
  'CONVITE_RECEBIDO',
  'CONVITE_CANCELADO',
  'SUBSTITUTO_ACEITOU',
  'CONVITE_RECUSADO',
  'CONVITE_EXPIRADO',
  'FILA_ESGOTADA',
  'APROVACAO_PENDENTE',
  // desfecho do repasse
  'REPASSE_APROVADO',
  'REPASSE_RECUSADO',
  'REPASSE_CANCELADO',
  // escala e execução (F16)
  'MEDICO_ESCALADO',
  'CHECKIN_LIBERADO',
  'CHECKOUT_REGISTRADO',
  'PLANTAO_SEM_CONFIRMACAO',
  'PLANTAO_CONFIRMADO',
  'PLANTAO_CONTESTADO',
  'CONTESTACAO_RESPONDIDA',
  'CONTESTACAO_RESOLVIDA',
  // verificação de cadastro
  'CRM_VERIFICADO',
  'INSTITUICAO_APROVADA',
  'CADASTRO_PENDENTE',
]);
export type TipoNotificacao = z.infer<typeof TipoNotificacao>;

export const NotificacaoResponse = z.strictObject({
  id: z.uuid(),
  tipo: TipoNotificacao,
  titulo: z.string(),
  corpo: z.string(),
  /** Rota do web para onde o aviso leva; nula quando não há tela a abrir. */
  link: z.string().nullable(),
  criadaEm: InstanteUtc,
  lida: z.boolean(),
});
export type NotificacaoResponse = z.infer<typeof NotificacaoResponse>;

/** As mais recentes, e quantas no total ainda não foram lidas — o número do sino. */
export const NotificacoesResponse = z.strictObject({
  naoLidas: z.number().int().nonnegative(),
  itens: z.array(NotificacaoResponse),
});
export type NotificacoesResponse = z.infer<typeof NotificacoesResponse>;

/** Intervalo do polling do web (DEC-127). */
export const INTERVALO_DE_NOTIFICACOES_MS = 20_000;
