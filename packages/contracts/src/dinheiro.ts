import { z } from 'zod';

/**
 * Dinheiro trafega como **centavos inteiros** (D11).
 *
 * Motivo: JSON não tem decimal exato, e o valor do plantão alimenta cálculo de
 * retenções (IRRF 1,5%, PIS/COFINS/CSLL 4,65% — Entrega 1 §5.3). Ponto flutuante
 * em base de cálculo de tributo é erro que ninguém percebe até a conferência manual
 * não fechar.
 *
 * O tipo é "branded": `Centavos` não é intercambiável com `number` por acidente, então
 * passar reais onde se espera centavos não compila. É a única forma de o compilador
 * pegar o erro mais provável desta camada.
 */
export const Centavos = z.number().int().nonnegative().brand<'Centavos'>();
export type Centavos = z.infer<typeof Centavos>;

const FORMATADOR_BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Constrói `Centavos` a partir de um inteiro já em centavos. */
export function centavos(valor: number): Centavos {
  return Centavos.parse(valor);
}

/**
 * Converte texto digitado por pessoa em centavos, **sem passar por float**.
 * Aceita as formas que um usuário brasileiro realmente digita:
 * `"1200"`, `"1200,50"`, `"1.200,50"`, `"R$ 1.200,50"`.
 */
export function centavosDeTexto(texto: string): Centavos {
  const limpo = texto.trim().replace(/^R\$/u, '').replace(/\s/gu, '');

  // Convenção pt-BR: ponto separa milhar, vírgula separa decimal.
  const normalizado = limpo.replace(/\./gu, '').replace(',', '.');

  const casado = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(normalizado);
  if (casado === null) {
    throw new Error(`Valor monetário inválido: ${JSON.stringify(texto)}`);
  }

  const inteiros = casado[1] ?? '0';
  const decimais = (casado[2] ?? '').padEnd(2, '0');

  return Centavos.parse(Number(inteiros) * 100 + Number(decimais));
}

/** `123456` → `"R$ 1.234,56"`. Para exibição apenas. */
export function formatarCentavos(valor: Centavos | number): string {
  return FORMATADOR_BRL.format(Number(valor) / 100);
}

/**
 * `123456` → `"1234.56"`. Esta é a fronteira com o `Decimal(10,2)` do Prisma:
 * o Prisma aceita string decimal sem perda, o que `number` não garante.
 */
export function centavosParaDecimal(valor: Centavos | number): string {
  const total = Math.trunc(Number(valor));
  const inteiros = Math.trunc(total / 100);
  const resto = total % 100;
  return `${inteiros}.${String(resto).padStart(2, '0')}`;
}

/** Caminho inverso: lê um `Decimal(10,2)` vindo do banco como centavos. */
export function decimalParaCentavos(decimal: string): Centavos {
  const casado = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(decimal.trim());
  if (casado === null) {
    throw new Error(`Decimal inválido: ${JSON.stringify(decimal)}`);
  }

  const inteiros = casado[1] ?? '0';
  const decimais = (casado[2] ?? '').padEnd(2, '0');

  return Centavos.parse(Number(inteiros) * 100 + Number(decimais));
}
