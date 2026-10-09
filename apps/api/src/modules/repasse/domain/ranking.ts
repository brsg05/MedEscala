/**
 * Ordenação PROVISÓRIA do matching (F09) — DEC-094.
 *
 * A fórmula definitiva depende de sinais que ainda não existem nos dados:
 * reputação (F18, Sprint 4), histórico de comparecimento (F19, adiada) e
 * distância (sem geolocalização no modelo). Até lá, ordena pelo que existe:
 *
 *   1. vínculo com a instituição — plantões já escalados nela;
 *   2. plantões cumpridos — executados ou liquidados, em qualquer instituição;
 *   3. desempate fixo — nome, depois id — para a ordem ser DETERMINÍSTICA, como
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
}

export function ordenarParaConvite(
  candidatos: readonly MetricasDoCandidato[],
): MetricasDoCandidato[] {
  return [...candidatos].sort(
    (a, b) =>
      b.vinculoComInstituicao - a.vinculoComInstituicao ||
      b.plantoesCumpridos - a.plantoesCumpridos ||
      a.nome.localeCompare(b.nome, 'pt-BR') ||
      a.medicoId.localeCompare(b.medicoId),
  );
}

/** Tamanho de cada lote da Forma 2 e limite da Forma 1 (DEC-087, DEC-096). */
export const TAMANHO_DO_LOTE = 5;
