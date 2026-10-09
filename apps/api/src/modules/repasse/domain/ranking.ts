/**
 * Ordenação do matching (F09) no MVP — DEC-094, DEC-136.
 *
 * Critérios EM SEQUÊNCIA, sem pesos: pesos seriam números inventados, e a
 * fórmula com reputação (F18, adiada) e distância (DEC-137) segue em aberto.
 * Ordena pelo que os dados já têm:
 *
 *   1. vínculo com a instituição — plantões já escalados nela;
 *   2. plantões cumpridos — executados ou liquidados (F16), em qualquer lugar;
 *   3. taxa de resposta aos convites — quem deixa convite vencer desce;
 *   4. desempate fixo — nome, depois id — para a ordem ser DETERMINÍSTICA, como
 *      exige o critério de aceite do Sprint 2.
 *
 * NUNCA pelo menor valor pedido: ranquear por preço empurraria o valor do
 * plantão para baixo. A garantia é estrutural — esta função não recebe valor
 * nenhum, então não há como alguém, depois, "só acrescentar" esse critério sem
 * mudar o tipo de entrada e passar por revisão.
 */
export interface MetricasDoCandidato {
  medicoId: string;
  nome: string;
  vinculoComInstituicao: number;
  plantoesCumpridos: number;
  /** De 0 a 1 — ver `taxaDeResposta`. */
  taxaDeResposta: number;
}

/** Janela da taxa de resposta: o comportamento recente é o que conta. */
export const JANELA_DA_TAXA_DE_RESPOSTA_DIAS = 90;

/**
 * Fração dos convites recebidos que tiveram resposta — aceite OU recusa. Recusar
 * é responder: o que a taxa pune é deixar vencer, que trava a fila de alguém.
 * Sem histórico, 1: quem nunca foi convidado não começa em desvantagem.
 */
export function taxaDeResposta(h: { respondidos: number; recebidos: number }): number {
  return h.recebidos === 0 ? 1 : h.respondidos / h.recebidos;
}

export function ordenarParaConvite(
  candidatos: readonly MetricasDoCandidato[],
): MetricasDoCandidato[] {
  return [...candidatos].sort(
    (a, b) =>
      b.vinculoComInstituicao - a.vinculoComInstituicao ||
      b.plantoesCumpridos - a.plantoesCumpridos ||
      b.taxaDeResposta - a.taxaDeResposta ||
      a.nome.localeCompare(b.nome, 'pt-BR') ||
      a.medicoId.localeCompare(b.medicoId),
  );
}

/** Tamanho de cada lote da Forma 2 e limite da Forma 1 (DEC-087, DEC-096). */
export const TAMANHO_DO_LOTE = 5;
