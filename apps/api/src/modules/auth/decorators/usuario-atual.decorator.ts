import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UsuarioAutenticado } from '@medescala/contracts';
import type { RequisicaoAutenticada } from '../tipos';

/**
 * Injeta o usuário da sessão no handler, já com os perfis resolvidos pelo
 * `JwtAuthGuard`. Evita que cada controller repita a leitura de `request.usuario`.
 */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
    const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();

    if (req.usuario === undefined) {
      // Só acontece se alguém usar o decorator numa rota @Publico() — erro de
      // programação, não de entrada do usuário.
      throw new Error('@UsuarioAtual() usado em rota sem autenticação');
    }

    return req.usuario;
  },
);
