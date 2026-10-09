import { describe, expect, it } from 'vitest';
import { calcularRetencoes, formatarAliquota, regraVigente } from './fiscal.js';

const HOJE = new Date('2026-10-09T12:00:00Z');

function pj(valorCentavos: number, regime: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | null) {
  return calcularRetencoes({
    valorCentavos,
    prestador: { modelo: 'PJ', regime },
    tomadorOptanteDoSimples: false,
    issRetidoBp: null,
    data: HOJE,
  });
}

describe('retenções do rascunho fiscal (F14)', () => {
  it('confere com o cálculo manual: IRRF 1,5% e PIS/COFINS/CSLL 4,65% (critério do Sprint 4)', () => {
    // R$ 1.200,00 → IRRF R$ 18,00; CSRF R$ 55,80; líquido R$ 1.126,20.
    const r = pj(120_000, 'LUCRO_PRESUMIDO');
    expect(r.linhas.map((l) => [l.tributo, l.valorCentavos, l.retido])).toEqual([
      ['IRRF', 1_800, true],
      ['PIS_COFINS_CSLL', 5_580, true],
    ]);
    expect(r.retidoCentavos).toBe(7_380);
    expect(r.liquidoCentavos).toBe(112_620);
  });

  it('dispensa retenção de até R$ 10, por nota (Leis 9.430/96 e 13.137/15)', () => {
    // R$ 500,00 → IRRF R$ 7,50 (dispensado); CSRF R$ 23,25 (retido).
    const r = pj(50_000, 'LUCRO_PRESUMIDO');
    expect(r.linhas[0]).toMatchObject({ valorCentavos: 750, retido: false });
    expect(r.linhas[1]).toMatchObject({ valorCentavos: 2_325, retido: true });
    expect(r.retidoCentavos).toBe(2_325);
  });

  it('prestador do Simples Nacional não sofre IRRF nem PIS/COFINS/CSLL', () => {
    const r = pj(120_000, 'SIMPLES_NACIONAL');
    expect(r.linhas.every((l) => !l.retido)).toBe(true);
    expect(r.liquidoCentavos).toBe(120_000);
  });

  it('dados fiscais incompletos: calcula como não optante e avisa', () => {
    const r = pj(120_000, null);
    expect(r.retidoCentavos).toBe(7_380);
    expect(r.observacoes.join(' ')).toContain('incompletos');
  });

  it('ISS retido quando a instituição configura a alíquota do município', () => {
    const r = calcularRetencoes({
      valorCentavos: 120_000,
      prestador: { modelo: 'PJ', regime: 'LUCRO_PRESUMIDO' },
      tomadorOptanteDoSimples: false,
      issRetidoBp: 500,
      data: HOJE,
    });
    expect(r.linhas.find((l) => l.tributo === 'ISS')?.valorCentavos).toBe(6_000);
    expect(r.liquidoCentavos).toBe(106_620);
  });

  it('RPA não é simulado — e o rascunho diz isso, em vez de inventar número (DEC-206)', () => {
    const r = calcularRetencoes({
      valorCentavos: 120_000,
      prestador: { modelo: 'RPA', regime: null },
      tomadorOptanteDoSimples: false,
      issRetidoBp: null,
      data: HOJE,
    });
    expect(r.linhas).toEqual([]);
    expect(r.observacoes[0]).toContain('não são simulados');
  });

  it('a regra tem fonte para cada número (§16)', () => {
    expect(regraVigente(HOJE).fontes.length).toBeGreaterThanOrEqual(4);
    expect(formatarAliquota(465)).toBe('4,65%');
  });
});
