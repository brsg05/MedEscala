import { SetMetadata } from '@nestjs/common';
import type { Perfil } from '@medescala/contracts';

export const PERFIS_KEY = 'perfis';

/**
 * Exige que o usuário tenha ao menos um dos perfis listados (ADR-006).
 *
 * @example
 *   @Perfis('CHEFIA_ESCALA')
 *   aprovar() { ... }   // F11 — aprovação bloqueante da substituição
 */
export const Perfis = (...perfis: readonly Perfil[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERFIS_KEY, perfis);
