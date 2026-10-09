import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Testes do frontend rodam em jsdom porque precisam EXECUTAR o React.
 *
 * `tsc` e `vite build` só analisam e empacotam — foi por isso que um erro de
 * interop de módulo (CJS × ESM) passou por lint, typecheck, build e e2e e só
 * apareceu como tela branca no navegador.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    // Sem `globals: true`, o auto-cleanup do Testing Library não se registra —
    // cada teste chama `cleanup()` explicitamente. E sem `restoreMocks`, porque
    // ele apaga a implementação definida no `beforeEach`.
    globals: false,
  },
});
