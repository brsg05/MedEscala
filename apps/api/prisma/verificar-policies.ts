/**
 * Confere que o SQL de `supabase/policies/` está efetivamente ativo no banco.
 *
 * Existe por causa do footgun do D3: `prisma migrate` pode recriar uma tabela e
 * derrubar trigger, índice parcial e RLS junto. Sem esta checagem, o sintoma seria
 * um teste de imutabilidade passando hoje e a trilha virando editável depois de uma
 * migration qualquer, sem ninguém perceber.
 *
 * Roda no CI logo depois de `db:deploy` + `db:policies`.
 */
import { Client } from 'pg';

interface Checagem {
  nome: string;
  sql: string;
}

const CHECAGENS: readonly Checagem[] = [
  {
    nome: 'trigger append-only de UPDATE/DELETE',
    sql: `SELECT 1 FROM pg_trigger
          WHERE tgname = 'evento_auditoria_append_only' AND NOT tgisinternal`,
  },
  {
    nome: 'trigger append-only de TRUNCATE',
    sql: `SELECT 1 FROM pg_trigger
          WHERE tgname = 'evento_auditoria_sem_truncate' AND NOT tgisinternal`,
  },
  {
    nome: 'índice único parcial de perfil global',
    sql: `SELECT 1 FROM pg_indexes
          WHERE indexname = 'perfil_acesso_usuario_perfil_global_key'`,
  },
  {
    nome: 'FK de usuario para auth.users',
    sql: `SELECT 1 FROM pg_constraint WHERE conname = 'usuario_id_fkey_auth_users'`,
  },
  {
    nome: 'trigger da RN01 (troca de executante)',
    sql: `SELECT 1 FROM pg_trigger
          WHERE tgname = 'plantao_rn01_executante' AND NOT tgisinternal`,
  },
  {
    nome: 'exclusion constraint da RN03 (sobreposição)',
    sql: `SELECT 1 FROM pg_constraint WHERE conname = 'plantao_rn03_sem_sobreposicao'`,
  },
  {
    nome: 'índice de no máximo um repasse em aberto',
    sql: `SELECT 1 FROM pg_indexes WHERE indexname = 'repasse_um_em_aberto_por_plantao'`,
  },
  {
    nome: 'check de recusa justificada (F11)',
    sql: `SELECT 1 FROM pg_constraint WHERE conname = 'repasse_recusa_justificada'`,
  },
  {
    nome: 'no máximo um convidado da vez por repasse',
    sql: `SELECT 1 FROM pg_indexes WHERE indexname = 'convite_um_ativo_por_repasse'`,
  },
  {
    nome: 'convite ativo sempre tem prazo',
    sql: `SELECT 1 FROM pg_constraint WHERE conname = 'convite_ativo_tem_prazo'`,
  },
  {
    nome: 'RLS ligada em todas as tabelas de domínio',
    sql: `SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname IN ('usuario','instituicao','perfil_acesso','refresh_token','evento_auditoria',
                              'medico','janela_disponibilidade','unidade','setor','escala','plantao','repasse',
                              'convite_repasse')
            AND c.relrowsecurity = false`,
  },
];

async function principal(): Promise<void> {
  const url = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];

  if (url === undefined || url === '') {
    throw new Error('DIRECT_URL (ou DATABASE_URL) não definida');
  }

  const cliente = new Client({ connectionString: url });
  await cliente.connect();

  const falhas: string[] = [];

  try {
    for (const checagem of CHECAGENS) {
      const { rowCount } = await cliente.query(checagem.sql);

      // A checagem de RLS é invertida: ela procura tabela SEM rls, então o
      // esperado é nenhuma linha.
      const invertida = checagem.nome.startsWith('RLS');
      const ok = invertida ? rowCount === 0 : (rowCount ?? 0) > 0;

      console.log(`${ok ? '  ok      ' : '  FALHOU  '}${checagem.nome}`);

      if (!ok) {
        falhas.push(checagem.nome);
      }
    }
  } finally {
    await cliente.end();
  }

  if (falhas.length > 0) {
    throw new Error(
      `${String(falhas.length)} policy(ies) ausente(s). ` +
        'Rode `pnpm db:policies` DEPOIS de `pnpm db:deploy` (ver D3 no guia).',
    );
  }

  console.log('\nTodas as policies estão ativas.');
}

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
