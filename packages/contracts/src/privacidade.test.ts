import { describe, expect, it } from 'vitest';
import {
  POLITICAS_DE_PRIVACIDADE,
  politicaPorVersao,
  politicaVigente,
  textoCanonicoDaPolitica,
} from './privacidade.js';

describe('política de privacidade versionada (F24)', () => {
  it('cada versão tem identificador único', () => {
    const versoes = POLITICAS_DE_PRIVACIDADE.map((p) => p.versao);
    expect(new Set(versoes).size).toBe(versoes.length);
  });

  it('a vigente é a mais recente cuja vigência já começou', () => {
    expect(politicaVigente(new Date('2026-11-23T12:00:00Z')).versao).toBe('2026-11-v1');
    expect(() => politicaVigente(new Date('2020-01-01T00:00:00Z'))).toThrow(/Nenhuma/u);
  });

  it('toda categoria declara finalidade, base legal e retenção', () => {
    for (const p of POLITICAS_DE_PRIVACIDADE) {
      for (const item of p.itens) {
        expect(item.finalidade.length).toBeGreaterThan(0);
        expect(item.baseLegal).toMatch(/art\. 7º/u);
        expect(item.retencao.length).toBeGreaterThan(0);
      }
    }
  });

  it('RN10 está escrita na política: nada de dado clínico ou de paciente', () => {
    for (const p of POLITICAS_DE_PRIVACIDADE) {
      expect(p.compromissos.join(' ')).toMatch(/dados clínicos ou dados de pacientes/u);
    }
  });

  it('o texto canônico não depende da ordem das chaves', () => {
    const v1 = politicaPorVersao('2026-11-v1');
    expect(v1).toBeDefined();
    if (v1 === undefined) return;
    const embaralhada = Object.fromEntries(Object.entries(v1).reverse()) as typeof v1;
    expect(textoCanonicoDaPolitica(embaralhada)).toBe(textoCanonicoDaPolitica(v1));
  });
});
