import { formatarDataHora, formatarHora, type RepasseResponse } from '@medescala/contracts';
import type { Elo, EstadoDoElo } from './CadeiaTriade';

/**
 * Traduz o estado do repasse na cadeia de três elos.
 *
 * Todo o mapeamento mora aqui, num lugar só, porque ele é a leitura visual da
 * RN01: o elo da instituição só fica verde quando o status é `APROVADO`, e
 * nenhum outro caminho produz esse verde.
 *
 * O elo do substituto mostra a fila (DEC-089): quem tem o convite agora e até
 * quando — ou que a fila voltou ao titular (DEC-096).
 */
export function cadeiaDe(repasse: RepasseResponse): readonly [Elo, Elo, Elo] {
  const s = repasse.status;
  const aceitou = s === 'SUBSTITUTO_ACEITO' || s === 'AGUARDANDO_APROVACAO' || s === 'APROVADO';

  let substituto: Elo;

  if (aceitou && repasse.substituto !== null) {
    substituto = {
      papel: 'SUBSTITUTO',
      nome: repasse.substituto.nome,
      registro: `CRM/${repasse.substituto.crmUf} ${repasse.substituto.crm}`,
      acao: 'aceitou cobrir',
      em: null,
      estado: 'concluido',
    };
  } else if (repasse.convidadoDaVez !== null) {
    substituto = {
      papel: 'SUBSTITUTO',
      nome: repasse.convidadoDaVez.nome,
      registro: `CRM/${repasse.convidadoDaVez.crmUf} ${repasse.convidadoDaVez.crm}`,
      acao: 'convidado, ainda não respondeu',
      em: repasse.prazoConviteAte === null ? null : `até ${formatarHora(repasse.prazoConviteAte)}`,
      estado: 'aguardando',
    };
  } else if (repasse.filaEsgotada) {
    substituto = {
      papel: 'SUBSTITUTO',
      nome: null,
      registro: null,
      acao: 'ninguém aceitou',
      em: null,
      estado: 'recusado',
    };
  } else {
    substituto = {
      papel: 'SUBSTITUTO',
      nome: null,
      registro: null,
      acao: s === 'CANCELADO' ? 'repasse cancelado' : 'procurando substituto',
      em: null,
      estado: 'pendente',
    };
  }

  const estadoInstituicao: EstadoDoElo =
    s === 'APROVADO'
      ? 'concluido'
      : s === 'RECUSADO_INSTITUICAO'
        ? 'recusado'
        : s === 'AGUARDANDO_APROVACAO'
          ? 'aguardando'
          : 'pendente';

  // Recusa da chefia que já retomou a fila (DEC-099): a justificativa continua
  // visível no elo da instituição.
  const recusouAntes = s === 'SOLICITADO' && repasse.justificativaRecusa !== null;

  return [
    {
      papel: 'TITULAR',
      nome: repasse.titular.nome,
      registro: `CRM/${repasse.titular.crmUf} ${repasse.titular.crm}`,
      acao: 'abriu o pedido',
      em: null,
      estado: 'concluido',
    },
    substituto,
    {
      papel: 'INSTITUIÇÃO',
      nome: null,
      registro: null,
      acao:
        estadoInstituicao === 'concluido'
          ? 'aprovou — escala atualizada'
          : estadoInstituicao === 'aguardando'
            ? 'aguardando aprovação'
            : recusouAntes
              ? `recusou o substituto anterior: ${repasse.justificativaRecusa ?? ''}`
              : s === 'CANCELADO'
                ? 'não chegou a decidir'
                : 'aguardando',
      em: repasse.aprovadoEm === null ? null : formatarDataHora(repasse.aprovadoEm),
      estado: recusouAntes ? 'recusado' : estadoInstituicao,
    },
  ];
}
