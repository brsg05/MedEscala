import { describe, expect, it } from 'vitest';
import { ordenarParaConvite, taxaDeResposta, type MetricasDoCandidato } from './ranking';

function c(
  nome: string,
  vinculoComInstituicao: number,
  plantoesCumpridos: number,
  medicoId = nome,
  taxa = 1,
): MetricasDoCandidato {
  return { medicoId, nome, vinculoComInstituicao, plantoesCumpridos, taxaDeResposta: taxa };
}

describe('ordenação do matching (DEC-094, DEC-136)', () => {
  it('põe primeiro quem tem mais vínculo com a instituição', () => {
    const ordem = ordenarParaConvite([c('Ana', 1, 50), c('Bruno', 3, 0), c('Carla', 2, 10)]);
    expect(ordem.map((x) => x.nome)).toEqual(['Bruno', 'Carla', 'Ana']);
  });

  it('desempata pelo número de plantões cumpridos', () => {
    const ordem = ordenarParaConvite([c('Ana', 2, 1), c('Bruno', 2, 9)]);
    expect(ordem.map((x) => x.nome)).toEqual(['Bruno', 'Ana']);
  });

  it('depois, quem responde aos convites vem antes de quem deixa vencer', () => {
    const ordem = ordenarParaConvite([
      c('Ana', 2, 5, 'a', 0.5),
      c('Bruno', 2, 5, 'b', 1),
      c('Carla', 2, 5, 'c', 0.8),
    ]);
    expect(ordem.map((x) => x.nome)).toEqual(['Bruno', 'Carla', 'Ana']);
  });

  it('a taxa de resposta não passa na frente do vínculo nem dos cumpridos', () => {
    const ordem = ordenarParaConvite([c('Ana', 1, 0, 'a', 1), c('Bruno', 2, 0, 'b', 0)]);
    expect(ordem.map((x) => x.nome)).toEqual(['Bruno', 'Ana']);
  });

  it('desempata por nome e depois por id, sem depender da ordem de entrada', () => {
    const empatados = [c('Bruno', 0, 0, 'id-2'), c('Ana', 0, 0, 'id-9'), c('Ana', 0, 0, 'id-1')];
    expect(ordenarParaConvite(empatados).map((x) => x.medicoId)).toEqual(['id-1', 'id-9', 'id-2']);
  });

  it('é determinística — critério de aceite do Sprint 2', () => {
    const base = [
      c('Diego', 1, 2),
      c('Ana', 1, 2),
      c('Bruno', 4, 0),
      c('Carla', 1, 5),
      c('Elisa', 0, 0),
    ];
    const esperado = ordenarParaConvite(base).map((x) => x.medicoId);

    // Todas as rotações da entrada produzem a mesma saída.
    for (let i = 0; i < base.length; i++) {
      const rotacionado = [...base.slice(i), ...base.slice(0, i)];
      expect(ordenarParaConvite(rotacionado).map((x) => x.medicoId)).toEqual(esperado);
    }
  });

  it('não altera a lista recebida', () => {
    const entrada = [c('Bruno', 0, 0), c('Ana', 0, 0)];
    ordenarParaConvite(entrada);
    expect(entrada.map((x) => x.nome)).toEqual(['Bruno', 'Ana']);
  });
});

describe('taxa de resposta (DEC-136)', () => {
  it('recusar conta como resposta; só vencer pesa contra', () => {
    expect(taxaDeResposta({ respondidos: 3, recebidos: 4 })).toBe(0.75);
  });

  it('sem histórico, 1 — ninguém começa em desvantagem', () => {
    expect(taxaDeResposta({ respondidos: 0, recebidos: 0 })).toBe(1);
  });
});
