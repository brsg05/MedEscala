import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';

const RAIZ_API = join(__dirname, '..', '..');
const ENTRY_PRISMA = require.resolve('prisma/build/index.js');
const DIR_POLICIES = join(RAIZ_API, '..', '..', 'supabase', 'policies');

export interface BancoDeTeste {
  url: string;
  cliente: Client;
  encerrar: () => Promise<void>;
}

/**
 * Sobe um Postgres 17 descartável e o deixa no MESMO estado que `pnpm db:migrate`
 * seguido de `pnpm db:policies` produz — inclusive na ordem, que é o ponto do D3.
 *
 * A imagem é `postgres:17` e não a do Supabase: esta camada testa garantias do
 * banco, não do Auth.
 */
export async function subirBancoDeTeste(): Promise<BancoDeTeste> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('medescala_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const url = container.getConnectionUri();

  // 1. O que o Supabase forneceria (schema `auth` e roles).
  await executarArquivo(url, join(__dirname, 'supabase-minimo.sql'));

  // 2. As tabelas, pelo Prisma — a fonte de verdade do ADR-003.
  //
  // Invocamos o entry-point JS do Prisma com `process.execPath` em vez de `npx`:
  // desde o endurecimento do Node no Windows, `spawn` de `.cmd` sem `shell: true`
  // falha com EINVAL, e `shell: true` traria problema de aspas. Resolver o módulo
  // é determinístico e igual nos três sistemas operacionais.
  execFileSync(process.execPath, [ENTRY_PRISMA, 'migrate', 'deploy'], {
    cwd: RAIZ_API,
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'pipe',
  });

  // 3. As policies, DEPOIS das tabelas.
  for (const arquivo of (await readdir(DIR_POLICIES)).filter((n) => n.endsWith('.sql')).sort()) {
    await executarArquivo(url, join(DIR_POLICIES, arquivo));
  }

  const cliente = new Client({ connectionString: url });
  await cliente.connect();

  return {
    url,
    cliente,
    encerrar: async (): Promise<void> => {
      await cliente.end();
      await container.stop();
    },
  };
}

async function executarArquivo(url: string, caminho: string): Promise<void> {
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    await cliente.query(await readFile(caminho, 'utf8'));
  } finally {
    await cliente.end();
  }
}
