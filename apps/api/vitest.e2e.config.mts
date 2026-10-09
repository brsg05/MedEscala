import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Camada 2 (D7) — fluxo ponta a ponta contra a stack local do Supabase.
 *
 * Exige `pnpm exec supabase start` antes. É aqui que login, rotação de refresh,
 * CSRF e os guards de perfil são exercitados como em produção — o que um Postgres
 * puro não consegue cobrir, por não ter GoTrue.
 *
 * `fileParallelism: false` porque os arquivos compartilham um único banco; rodar em
 * paralelo faria um teste apagar a sessão do outro.
 */
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.e2e.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
