import { z } from 'zod';

/**
 * Perfis de acesso do ADR-006. A mesma lista é usada pelo `PerfisGuard` da api e
 * pela navegação do web — é exatamente o tipo de duplicação que `contracts` existe
 * para evitar.
 *
 * Corresponde ao `enum Perfil` do schema Prisma. Se um valor for adicionado aqui,
 * ele precisa de migration correspondente — e vice-versa.
 */
export const PERFIS = [
  'MEDICO',
  'CHEFIA_ESCALA',
  'ADMIN_INSTITUICAO',
  'OPERADOR_PLATAFORMA',
] as const;

export const Perfil = z.enum(PERFIS);
export type Perfil = z.infer<typeof Perfil>;

/** Rótulos para exibição. O domínio é em português (§12), inclusive na UI. */
export const ROTULO_PERFIL: Record<Perfil, string> = {
  MEDICO: 'Médico',
  CHEFIA_ESCALA: 'Chefia de escala',
  ADMIN_INSTITUICAO: 'Administrador da instituição',
  OPERADOR_PLATAFORMA: 'Operador da plataforma',
};
