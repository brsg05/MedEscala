/**
 * `@medescala/contracts` — fronteira tipada entre `apps/api` e `apps/web`.
 *
 * ADR-005: todo DTO de entrada é um schema Zod, com o tipo TypeScript **inferido** do
 * schema. Uma definição só, validando em runtime e tipando em compile time — o frontend
 * não redigita nenhum tipo de API.
 *
 * Regra do §12: tipo de domínio não sai do módulo; o que atravessa fronteira é schema
 * deste pacote.
 */
export * from './perfis.js';
export * from './dinheiro.js';
export * from './datahora.js';
export * from './auth.js';
export * from './dominio.js';
