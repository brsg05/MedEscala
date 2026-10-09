import { describe, expect, it } from 'vitest';
import {
  duracaoEmHoras,
  formatarData,
  formatarDataHora,
  formatarHora,
  InstanteUtc,
  Intervalo,
} from './datahora.js';

describe('InstanteUtc', () => {
  it('aceita ISO 8601 em UTC', () => {
    expect(InstanteUtc.parse('2026-09-12T22:30:00Z')).toBe('2026-09-12T22:30:00Z');
  });

  it('recusa instante com offset ou sem fuso — UTC é a única forma aceita no wire', () => {
    expect(InstanteUtc.safeParse('2026-09-12T19:30:00-03:00').success).toBe(false);
    expect(InstanteUtc.safeParse('2026-09-12T19:30:00').success).toBe(false);
    expect(InstanteUtc.safeParse('12/09/2026').success).toBe(false);
  });
});

describe('formatação em America/Recife', () => {
  it('converte de UTC para o fuso de exibição', () => {
    // Recife é UTC-3 o ano inteiro (sem horário de verão desde 2019).
    expect(formatarDataHora('2026-09-12T22:30:00Z')).toBe('12/09/2026 19:30');
    expect(formatarData('2026-09-12T22:30:00Z')).toBe('12/09/2026');
    expect(formatarHora('2026-09-12T22:30:00Z')).toBe('19:30');
  });

  it('mostra o dia local correto quando o instante UTC já virou o dia', () => {
    // 01:00Z do dia 13 ainda é 22:00 do dia 12 em Recife. Exibir "13/09" aqui
    // seria o bug clássico que a decisão de guardar em UTC existe para evitar.
    expect(formatarDataHora('2026-09-13T01:00:00Z')).toBe('12/09/2026 22:00');
  });
});

describe('Intervalo', () => {
  it('exige fim posterior ao início', () => {
    expect(
      Intervalo.safeParse({ inicio: '2026-09-12T22:00:00Z', fim: '2026-09-12T22:00:00Z' }).success,
    ).toBe(false);
    expect(
      Intervalo.safeParse({ inicio: '2026-09-13T10:00:00Z', fim: '2026-09-12T22:00:00Z' }).success,
    ).toBe(false);
  });
});

describe('duracaoEmHoras', () => {
  it('mede plantão noturno que cruza a meia-noite', () => {
    // 19:00 às 07:00 em Recife = 22:00Z a 10:00Z do dia seguinte.
    const plantaoNoturno = Intervalo.parse({
      inicio: '2026-09-12T22:00:00Z',
      fim: '2026-09-13T10:00:00Z',
    });
    expect(duracaoEmHoras(plantaoNoturno)).toBe(12);
  });

  it('mede o limite de 24h da RN03', () => {
    const vintequatro = Intervalo.parse({
      inicio: '2026-09-12T00:00:00Z',
      fim: '2026-09-13T00:00:00Z',
    });
    expect(duracaoEmHoras(vintequatro)).toBe(24);
  });
});
