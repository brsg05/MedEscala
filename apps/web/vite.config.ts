import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // A porta é fixa de propósito: o CORS e a validação de `Origin` da api (D9)
    // liberam exatamente `http://localhost:5173`. Deixar o Vite escolher outra
    // porta quando a 5173 estiver ocupada faria o login falhar com 403 sem motivo
    // aparente.
    strictPort: true,
  },
});
