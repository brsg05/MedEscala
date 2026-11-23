import { SetMetadata } from '@nestjs/common';

export const SEM_ACEITE_KEY = 'semAceiteDaPolitica';

/**
 * Libera a rota para quem ainda não aceitou a política vigente (F24, DEC-225).
 *
 * Só se qualificam as rotas que a pessoa precisa para LER e ACEITAR a política,
 * e as de sessão (quem não aceita precisa conseguir sair). Como o `@Publico()`,
 * é explícito e aparece no diff.
 */
export const SemAceiteDaPolitica = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SEM_ACEITE_KEY, true);
