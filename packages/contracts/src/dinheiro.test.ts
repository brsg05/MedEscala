import { describe, expect, it } from 'vitest';
import {
  centavos,
  centavosDeTexto,
  centavosParaDecimal,
  decimalParaCentavos,
  formatarCentavos,
} from './dinheiro.js';

describe('centavosDeTexto', () => {
  it('aceita as formas que um usuário brasileiro realmente digita', () => {
    expect(centavosDeTexto('1200')).toBe(120_000);
    expect(centavosDeTexto('1200,50')).toBe(120_050);
    expect(centavosDeTexto('1.200,50')).toBe(120_050);
    expect(centavosDeTexto('R$ 1.200,50')).toBe(120_050);
    expect(centavosDeTexto('  R$1.200,50  ')).toBe(120_050);
  });

  it('completa uma casa decimal solitária', () => {
    expect(centavosDeTexto('10,5')).toBe(1050);
  });

  it('rejeita entrada que não é valor monetário', () => {
    expect(() => centavosDeTexto('')).toThrow(/inválido/u);
    expect(() => centavosDeTexto('abc')).toThrow(/inválido/u);
    expect(() => centavosDeTexto('1,234')).toThrow(/inválido/u);
  });

  it('rejeita valor negativo — não há plantão de valor negativo', () => {
    expect(() => centavosDeTexto('-100')).toThrow(/inválido/u);
  });
});

describe('fronteira com o Decimal(10,2) do Prisma', () => {
  it('faz ida e volta sem perder centavo', () => {
    for (const texto of ['0', '0,01', '1', '19,99', '1.200,50', '99.999.999,99']) {
      const original = centavosDeTexto(texto);
      expect(decimalParaCentavos(centavosParaDecimal(original))).toBe(original);
    }
  });

  it('serializa com duas casas sempre', () => {
    expect(centavosParaDecimal(centavos(0))).toBe('0.00');
    expect(centavosParaDecimal(centavos(5))).toBe('0.05');
    expect(centavosParaDecimal(centavos(100))).toBe('1.00');
    expect(centavosParaDecimal(centavos(120_050))).toBe('1200.50');
  });

  it('não reintroduz erro de ponto flutuante ao somar', () => {
    // 0,07 × 3 em float dá 0.21000000000000002. Em centavos, é exato —
    // e é isso que sustenta o cálculo de retenções (Entrega 1 §5.3).
    const tres = centavos(7) + centavos(7) + centavos(7);
    expect(centavosParaDecimal(tres)).toBe('0.21');
  });
});

describe('formatarCentavos', () => {
  // O Intl insere U+00A0 (espaço não separável) depois de "R$". O escape é explícito
  // aqui de propósito: NBSP literal no código-fonte é invisível na revisão de PR.
  const ESPACO_NBSP = '\u00A0';
  const normalizar = (s: string): string => s.replaceAll(ESPACO_NBSP, ' ');

  it('formata em real brasileiro', () => {
    expect(normalizar(formatarCentavos(centavos(120_050)))).toBe('R$ 1.200,50');
    expect(normalizar(formatarCentavos(centavos(0)))).toBe('R$ 0,00');
    expect(normalizar(formatarCentavos(centavos(5)))).toBe('R$ 0,05');
  });
});
