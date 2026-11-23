import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { subirBancoDeTeste, type BancoDeTeste } from '../support/banco-de-teste';

/**
 * F24 — o aceite da política é prova, e prova não se reescreve. O banco recusa
 * UPDATE (supabase/policies/009); um segundo aceite da mesma versão colide.
 */
describe('aceite_politica é imutável', () => {
  let banco: BancoDeTeste;
  const usuarioId = randomUUID();
  const HASH = 'a'.repeat(64);

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await banco.cliente.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [
      usuarioId,
      'aceite@medescala.test',
    ]);
    await banco.cliente.query(
      `INSERT INTO usuario (id, email, nome, atualizado_em) VALUES ($1, $2, 'Aceite', now())`,
      [usuarioId, 'aceite@medescala.test'],
    );
    await banco.cliente.query(
      `INSERT INTO aceite_politica (id, usuario_id, versao, hash_texto) VALUES ($1, $2, 'v1', $3)`,
      [randomUUID(), usuarioId, HASH],
    );
  });

  afterAll(async () => {
    await banco?.encerrar();
  });

  it('recusa UPDATE — nem a versão, nem a data, nem o hash mudam', async () => {
    await expect(
      banco.cliente.query(`UPDATE aceite_politica SET aceito_em = now() - interval '1 year'`),
    ).rejects.toThrow(/imutável/iu);
  });

  it('recusa o mesmo aceite duas vezes', async () => {
    await expect(
      banco.cliente.query(
        `INSERT INTO aceite_politica (id, usuario_id, versao, hash_texto) VALUES ($1, $2, 'v1', $3)`,
        [randomUUID(), usuarioId, HASH],
      ),
    ).rejects.toThrow(/duplicate key/iu);
  });

  it('recusa hash que não é SHA-256 em hexadecimal', async () => {
    await expect(
      banco.cliente.query(
        `INSERT INTO aceite_politica (id, usuario_id, versao, hash_texto) VALUES ($1, $2, 'v2', $3)`,
        [randomUUID(), usuarioId, 'Z'.repeat(64)],
      ),
    ).rejects.toThrow(/aceite_politica_hash_hex/iu);
  });

  it('aceita versão nova — a anterior continua lá', async () => {
    await banco.cliente.query(
      `INSERT INTO aceite_politica (id, usuario_id, versao, hash_texto) VALUES ($1, $2, 'v2', $3)`,
      [randomUUID(), usuarioId, HASH],
    );
    const { rows } = await banco.cliente.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM aceite_politica WHERE usuario_id = $1`,
      [usuarioId],
    );
    expect(rows[0]?.n).toBe(2);
  });
});
