import { SetMetadata } from '@nestjs/common';

export const PUBLICO_KEY = 'publico';

/**
 * Marca uma rota como acessível sem autenticação.
 *
 * O `JwtAuthGuard` é global: por padrão TUDO exige sessão. Abrir uma rota é um ato
 * explícito e visível na revisão de PR — o contrário (esquecer de proteger) seria
 * silencioso.
 */
export const Publico = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLICO_KEY, true);
