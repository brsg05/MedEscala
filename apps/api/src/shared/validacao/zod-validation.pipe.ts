import { Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { EntradaInvalidaError } from '../errors/dominio.error';

/**
 * Valida o corpo da requisição contra um schema de @medescala/contracts (ADR-005).
 *
 * O schema é o MESMO objeto que o frontend importa — é isto que o guia chama de
 * "o frontend não redigita nenhum tipo de API" (§9). Falha vira `EntradaInvalidaError`,
 * que o filtro traduz para 400 com os campos problemáticos em `detalhes`.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(valor: unknown): T {
    const resultado = this.schema.safeParse(valor);

    if (!resultado.success) {
      throw new EntradaInvalidaError(
        resultado.error.issues.map((i) => ({
          campo: i.path.join('.'),
          mensagem: i.message,
        })),
      );
    }

    return resultado.data;
  }
}
