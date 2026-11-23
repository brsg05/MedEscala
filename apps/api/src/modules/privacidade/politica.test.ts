import { describe, expect, it } from 'vitest';
import { politicaPorVersao } from '@medescala/contracts';
import { hashDaPolitica } from './privacidade.service';

/**
 * Versão publicada é congelada (F24): quem aceitou a v1 aceitou aquele texto, e
 * o hash gravado no aceite precisa continuar conferindo. Se este teste quebrar,
 * NÃO atualize o hash — publique uma versão nova em `POLITICAS_DE_PRIVACIDADE`.
 */
describe('hash da política de privacidade', () => {
  it('a versão 2026-11-v1 continua com o mesmo texto', () => {
    const v1 = politicaPorVersao('2026-11-v1');
    expect(v1).toBeDefined();
    if (v1 === undefined) return;
    expect(hashDaPolitica(v1)).toBe(
      '771d9820ccb13d411d644b57fae6debb333482a68db58273d4174bd5943a6ebf',
    );
  });
});
