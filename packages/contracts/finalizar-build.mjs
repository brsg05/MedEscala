/**
 * Fecha o build de saída dupla e CONFERE que ele serve aos dois consumidores.
 *
 * Existe por causa de um bug real: o pacote era publicado só em CommonJS. A api
 * (CJS) funcionava, o navegador quebrava com "does not provide an export named
 * 'COOKIE_CSRF_TOKEN'" e a tela ficava branca.
 *
 * Por que a checagem mora aqui e não num teste: Vitest roda em Node, que faz
 * interop CJS→ESM sozinho — um teste passa mesmo com o pacote quebrado. Só o
 * navegador reprova, e ele não participa do `pnpm verify`. O lugar honesto de
 * garantir o formato do artefato é onde o artefato nasce.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const base = new URL('./dist/', import.meta.url);

// O Node classifica .js pelo `type` do package.json mais próximo. Sem este
// marcador ele leria a pasta esm como CommonJS.
writeFileSync(new URL('./esm/package.json', base), '{ "type": "module" }\n');

const pacote = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const condicoes = pacote.exports?.['.'] ?? {};
const falhas = [];

if (condicoes.import === undefined) {
  falhas.push('package.json: exports["."] precisa da condição "import" (é o que o navegador usa)');
}
if (condicoes.require === undefined) {
  falhas.push('package.json: exports["."] precisa da condição "require" (é o que a api usa)');
}

// Uma exportação nomeada qualquer serve de canário: se o formato do módulo
// estiver errado, ela não aparece.
const CANARIO = 'COOKIE_CSRF_TOKEN';

const esm = await import(new URL('./esm/index.js', base));
if (esm[CANARIO] === undefined) {
  falhas.push(`dist/esm/index.js não exporta ${CANARIO} — o web quebraria com tela branca`);
}

const cjs = createRequire(import.meta.url)('./dist/cjs/index.js');
if (cjs[CANARIO] === undefined) {
  falhas.push(`dist/cjs/index.js não exporta ${CANARIO} — a api não subiria`);
}

if (falhas.length > 0) {
  console.error('Build de @medescala/contracts inválido:');
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('contracts: saída dupla ok (esm + cjs, exportações nomeadas conferidas)');
