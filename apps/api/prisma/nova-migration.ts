/**
 * Gera uma migration nova a partir do `schema.prisma`.
 *
 * POR QUE NÃO `prisma migrate dev`: o arquivo `supabase/policies/001` cria uma
 * FK de `public.usuario` para `auth.users`, que é schema do Supabase. O
 * `migrate dev` introspeta o banco antes de gerar, encontra essa referência
 * cross-schema e aborta com P4002 — pedindo que `auth` entre na lista de
 * `schemas` do datasource, o que faria o Prisma achar que gerencia o schema do
 * Auth. Não queremos isso.
 *
 * A saída é o `migrate diff`: ele reproduz as migrations existentes num shadow
 * database limpo (onde a FK não existe, porque ela não vem de migration Prisma)
 * e compara com o datamodel. O resultado é o mesmo SQL que o `migrate dev`
 * produziria.
 *
 *   pnpm --filter @medescala/api run db:nova-migration -- nome_da_migration
 *
 * Depois de gerar, revise o SQL, rode `pnpm db:deploy` e então `pnpm db:policies`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const RAIZ_API = join(__dirname, '..');
const DIR_MIGRATIONS = join(RAIZ_API, 'prisma', 'migrations');
const ENTRY_PRISMA = require.resolve('prisma/build/index.js');

const SHADOW = 'medescala_shadow';

function carimboDeTempo(): string {
  return new Date().toISOString().replace(/\D/gu, '').slice(0, 14);
}

async function recriarShadow(urlBase: string): Promise<string> {
  const cliente = new Client({ connectionString: urlBase });
  await cliente.connect();
  try {
    // `migrate diff` exige shadow vazio: sobras de uma execução anterior fazem
    // o diff sair vazio, sem erro — o sintoma mais confuso possível.
    await cliente.query(`DROP DATABASE IF EXISTS ${SHADOW}`);
    await cliente.query(`CREATE DATABASE ${SHADOW}`);
  } finally {
    await cliente.end();
  }

  return urlBase.replace(/\/[^/?]+(\?|$)/u, `/${SHADOW}$1`);
}

async function principal(): Promise<void> {
  // O pnpm repassa o separador `--` junto com os argumentos; filtrar evita que
  // ele vire o nome da migration.
  const nome = process.argv.slice(2).find((a) => a !== '--');

  if (nome === undefined || !/^[a-z0-9_]+$/u.test(nome)) {
    throw new Error(
      'Informe o nome da migration em snake_case. Ex.: pnpm db:nova-migration -- f16_execucao',
    );
  }

  const url = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];

  if (url === undefined || url === '') {
    throw new Error('DIRECT_URL (ou DATABASE_URL) não definida');
  }

  const urlShadow = await recriarShadow(url);

  // Gerado FORA de `prisma/migrations` de propósito: o diretório é a entrada do
  // diff, e criar o arquivo lá dentro antes faria o Prisma lê-lo como migration.
  const temporario = join(RAIZ_API, `.migration-${carimboDeTempo()}.sql`);

  execFileSync(
    process.execPath,
    [
      ENTRY_PRISMA,
      'migrate',
      'diff',
      '--from-migrations',
      DIR_MIGRATIONS,
      '--to-schema-datamodel',
      join(RAIZ_API, 'prisma', 'schema.prisma'),
      '--shadow-database-url',
      urlShadow,
      '--script',
    ],
    { cwd: RAIZ_API, stdio: ['ignore', openSync(temporario, 'w'), 'inherit'] },
  );

  // Sem diferença, o `migrate diff` não devolve arquivo vazio: devolve o
  // comentário `-- This is an empty migration.`. Checar só o tamanho deixaria
  // passar uma migration vazia a cada execução.
  const sql = readFileSync(temporario, 'utf8');
  const temComandos = sql.replace(/--.*/gu, '').trim().length > 0;

  if (!temComandos) {
    rmSync(temporario);
    console.log('Nenhuma diferença entre o schema e as migrations. Nada a fazer.');
    return;
  }

  const destino = join(DIR_MIGRATIONS, `${carimboDeTempo()}_${nome}`);
  mkdirSync(destino, { recursive: true });
  renameSync(temporario, join(destino, 'migration.sql'));

  console.log(`Migration gerada em ${destino}`);
  console.log('\nRevise o SQL e então rode, NESTA ORDEM:');
  console.log('  pnpm db:deploy');
  console.log('  pnpm db:policies');
  console.log('  pnpm db:verificar-policies');
}

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
