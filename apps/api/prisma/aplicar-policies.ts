/**
 * Aplica o SQL de `supabase/policies/` (D3).
 *
 * Roda SEMPRE depois de `prisma migrate`: uma migration que recria tabela derruba
 * policies, triggers e índices parciais ligados a ela. Por isso todo arquivo lá é
 * idempotente e este script pode ser executado quantas vezes for preciso.
 *
 * Usa `pg` em vez do Prisma porque o protocolo estendido que o Prisma usa não
 * aceita múltiplos comandos numa tacada, e o arquivo tem blocos `DO $$ ... $$` e
 * definição de função. O protocolo simples do `pg` aceita.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

// `__dirname` e nao `import.meta.dirname`: o tsconfig da api e commonjs (exigencia
// do NestJS, que depende de emitDecoratorMetadata), e o tsx executa este arquivo
// como CJS.
const DIRETORIO = join(__dirname, '..', '..', '..', 'supabase', 'policies');

async function principal(): Promise<void> {
  const url = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];

  if (url === undefined || url === '') {
    throw new Error('DIRECT_URL (ou DATABASE_URL) não definida — veja apps/api/.env.example');
  }

  const arquivos = (await readdir(DIRETORIO)).filter((n) => n.endsWith('.sql')).sort();

  if (arquivos.length === 0) {
    console.warn(`Nenhum .sql encontrado em ${DIRETORIO}`);
    return;
  }

  const cliente = new Client({ connectionString: url });
  await cliente.connect();

  try {
    for (const arquivo of arquivos) {
      const sql = await readFile(join(DIRETORIO, arquivo), 'utf8');
      await cliente.query(sql);
      console.log(`  aplicado  ${arquivo}`);
    }
  } finally {
    await cliente.end();
  }

  console.log(`\n${arquivos.length} arquivo(s) de policy aplicados.`);
}

principal().catch((erro: unknown) => {
  console.error('Falha ao aplicar policies:', erro);
  process.exit(1);
});
