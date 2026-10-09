import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { subirBancoDeTeste, type BancoDeTeste } from '../support/banco-de-teste';

/**
 * ADR-007 / RNF04 — a trilha de auditoria é append-only.
 *
 * O guia (§12) exige que toda regra tenha um teste que TENTE violá-la e espere
 * falha. Estes testes tentam adulterar a trilha e esperam erro **do Postgres**, não
 * do código da aplicação: é essa a diferença entre uma promessa e uma garantia.
 *
 * Detalhe que motivou o desenho: REVOKE sozinho não bastaria, porque o dono da
 * tabela mantém todos os privilégios e o Prisma conecta como `postgres`, que é o
 * dono. Quem garante é o trigger. Se alguém trocar o trigger por REVOKE achando que
 * é equivalente, estes testes quebram.
 */
describe('evento_auditoria é append-only', () => {
  let banco: BancoDeTeste;

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
  });

  afterAll(async () => {
    await banco?.encerrar();
  });

  async function inserirEvento(): Promise<void> {
    await banco.cliente.query(
      `INSERT INTO evento_auditoria (acao, entidade, estado_novo)
       VALUES ('REPASSE_APROVADO', 'Repasse', 'APROVADO')`,
    );
  }

  it('aceita INSERT — a trilha precisa ser gravável', async () => {
    await inserirEvento();

    const { rows } = await banco.cliente.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM evento_auditoria',
    );

    expect(rows[0]?.n).toBeGreaterThan(0);
  });

  it('recusa UPDATE', async () => {
    await inserirEvento();

    await expect(
      banco.cliente.query(`UPDATE evento_auditoria SET estado_novo = 'ADULTERADO'`),
    ).rejects.toThrow(/append-only/iu);
  });

  it('recusa DELETE', async () => {
    await inserirEvento();

    await expect(banco.cliente.query('DELETE FROM evento_auditoria')).rejects.toThrow(
      /append-only/iu,
    );
  });

  it('recusa TRUNCATE — que escapa de trigger FOR EACH ROW', async () => {
    await inserirEvento();

    await expect(banco.cliente.query('TRUNCATE evento_auditoria')).rejects.toThrow(/append-only/iu);
  });

  it('preserva as linhas depois de todas as tentativas', async () => {
    const { rows } = await banco.cliente.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM evento_auditoria',
    );

    expect(rows[0]?.n).toBeGreaterThan(0);
  });
});

describe('integridade que o Prisma sozinho não expressa', () => {
  let banco: BancoDeTeste;

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
  });

  afterAll(async () => {
    await banco?.encerrar();
  });

  it('recusa usuário sem credencial correspondente em auth.users', async () => {
    await expect(
      banco.cliente.query(
        `INSERT INTO usuario (id, email, nome, criado_em, atualizado_em)
         VALUES ($1, 'orfao@medescala.test', 'Órfão', now(), now())`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/foreign key|usuario_id_fkey_auth_users/iu);
  });

  it('impede perfil global duplicado, que o @@unique do Prisma deixa passar', async () => {
    const id = randomUUID();

    await banco.cliente.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [
      id,
      'operador@medescala.test',
    ]);
    await banco.cliente.query(
      `INSERT INTO usuario (id, email, nome, criado_em, atualizado_em)
       VALUES ($1, 'operador@medescala.test', 'Operador', now(), now())`,
      [id],
    );

    const inserirPerfilGlobal = (): Promise<unknown> =>
      banco.cliente.query(
        `INSERT INTO perfil_acesso (id, usuario_id, instituicao_id, perfil, ativo, criado_em)
         VALUES ($1, $2, NULL, 'OPERADOR_PLATAFORMA', true, now())`,
        [randomUUID(), id],
      );

    await inserirPerfilGlobal();

    // Em Postgres, dois NULLs não colidem num índice único comum — sem o índice
    // parcial de supabase/policies, esta segunda inserção passaria.
    await expect(inserirPerfilGlobal()).rejects.toThrow(
      /perfil_acesso_usuario_perfil_global_key|duplicate key/iu,
    );
  });
});
