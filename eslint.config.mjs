import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/generated/**',
      'apps/api/prisma/migrations/**',
      'supabase/.temp/**',
      'supabase/.branches/**',
      'guia do projeto/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    // Scripts de build e de banco rodam em Node puro. Em arquivos .ts o `no-undef`
    // fica desligado porque o próprio TypeScript já resolve os globais; num .mjs
    // ele vale, e sem isto `console`, `process` e `URL` viram erro.
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: { globals: { ...globals.node } },
  },

  {
    rules: {
      // §14 do guia lista "`any` se espalhando sob pressão de prazo" como risco, e a
      // mitigação acordada é "regra de lint que falha o build". Portanto `error`, não
      // `warn`. O §12 permite `any` com comentário justificando — nesse caso use um
      // `eslint-disable-next-line` com o motivo escrito, que fica visível no diff do PR.
      '@typescript-eslint/no-explicit-any': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // Erro de domínio é classe própria (§12). `throw 'string'` escapa do
      // ExceptionFilter e vira 500 silencioso.
      'no-throw-literal': 'error',
    },
  },
);
