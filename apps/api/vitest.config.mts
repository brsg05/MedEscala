import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Camada 1 (D7) — garantias de SCHEMA, sobre Postgres puro em Testcontainers.
 *
 * Aqui se testa o que o banco promete independentemente da aplicação: imutabilidade
 * da trilha (ADR-007/RNF04) e integridade referencial. Não precisa do GoTrue, então
 * não precisa da stack inteira do Supabase — sobe rápido e roda isolado.
 */
export default defineConfig({
  test: {
    include: ['test/schema/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // Subir container e aplicar migrations é lento na primeira vez.
    testTimeout: 120_000,
    hookTimeout: 240_000,
    pool: 'forks',
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
