import { SetMetadata } from '@nestjs/common';

export const SEM_CSRF_KEY = 'semCsrf';

/**
 * Dispensa a verificação de double-submit numa rota de mutação.
 *
 * Só o login se qualifica: quem ainda não tem sessão não tem cookie de CSRF para
 * reenviar. A validação de `Origin` continua valendo, inclusive aqui — ela é a
 * camada que sobra contra login forçado por CSRF.
 */
export const SemCsrf = (): MethodDecorator => SetMetadata(SEM_CSRF_KEY, true);
