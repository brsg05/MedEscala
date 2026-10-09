import type { StatusRepasse } from '@prisma/client';

/**
 * Transições do repasse — reproduz literalmente a tabela do §7.3 do guia.
 *
 * Função pura, sem Nest e sem banco, para que o teste da regra não precise de
 * infraestrutura. É o que o guia pede: "implementar as transições como função
 * pura testável fora do Nest".
 */
const TRANSICOES: Readonly<Record<StatusRepasse, readonly StatusRepasse[]>> = {
  SOLICITADO: ['SUBSTITUTO_ACEITO', 'CANCELADO'],
  SUBSTITUTO_ACEITO: ['AGUARDANDO_APROVACAO', 'RECUSADO_SUBSTITUTO'],
  AGUARDANDO_APROVACAO: ['APROVADO', 'RECUSADO_INSTITUICAO'],
  APROVADO: [],
  // Recusa devolve o pedido ao início: o titular pode indicar outro substituto.
  RECUSADO_SUBSTITUTO: ['SOLICITADO'],
  RECUSADO_INSTITUICAO: ['SOLICITADO'],
  CANCELADO: [],
};

export function podeTransicionar(de: StatusRepasse, para: StatusRepasse): boolean {
  return TRANSICOES[de].includes(para);
}

export function transicoesDe(de: StatusRepasse): readonly StatusRepasse[] {
  return TRANSICOES[de];
}

/** Estados em que o repasse ainda disputa o plantão. */
export const EM_ABERTO: readonly StatusRepasse[] = [
  'SOLICITADO',
  'SUBSTITUTO_ACEITO',
  'AGUARDANDO_APROVACAO',
];

export function estaEmAberto(status: StatusRepasse): boolean {
  return EM_ABERTO.includes(status);
}

/**
 * Só APROVADO troca o executante (RN01).
 *
 * Existe como função nomeada, e não como comparação solta espalhada pelo código,
 * porque este é o predicado que define a regra central do produto.
 */
export function concluiSubstituicao(status: StatusRepasse): boolean {
  return status === 'APROVADO';
}
