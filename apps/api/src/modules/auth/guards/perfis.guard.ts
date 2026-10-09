import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Perfil } from '@medescala/contracts';
import { NaoAutenticadoError, PerfilInsuficienteError } from '../../../shared/errors/dominio.error';
import { PERFIS_KEY } from '../decorators/perfis.decorator';
import type { RequisicaoAutenticada } from '../tipos';

/**
 * Autorização por perfil (ADR-006). Roda depois do `JwtAuthGuard`, que já resolveu
 * `req.usuario.perfis`.
 *
 * Rota sem `@Perfis(...)` exige apenas sessão válida — qualquer usuário autenticado
 * passa. O escopo de instituição é verificado pelo serviço de cada módulo, que sabe
 * a qual instituição o recurso pertence; o guard não tem como saber isso.
 */
@Injectable()
export class PerfisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const exigidos = this.reflector.getAllAndOverride<readonly Perfil[] | undefined>(PERFIS_KEY, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    if (exigidos === undefined || exigidos.length === 0) {
      return true;
    }

    const req = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();

    if (req.usuario === undefined) {
      throw new NaoAutenticadoError();
    }

    const tem = req.usuario.perfis.some((p) => exigidos.includes(p.perfil));

    if (!tem) {
      throw new PerfilInsuficienteError(exigidos);
    }

    return true;
  }
}
