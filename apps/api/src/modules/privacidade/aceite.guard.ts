import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { politicaVigente } from '@medescala/contracts';
import { AceiteDaPoliticaPendenteError } from '../../shared/errors/dominio-negocio.error';
import { PUBLICO_KEY } from '../auth/decorators/publico.decorator';
import type { RequisicaoAutenticada } from '../auth/tipos';
import { PrivacidadeService } from './privacidade.service';
import { SEM_ACEITE_KEY } from './sem-aceite.decorator';

/**
 * F24 — sem aceite da política vigente, a conta não usa a plataforma (DEC-225).
 *
 * Roda depois do `JwtAuthGuard` e do `PerfisGuard`. A conferência fica no
 * backend, e não só no web, pelo mesmo motivo do ADR-010: o BFF é a única porta,
 * e uma regra que só a tela aplica é uma regra que um `curl` ignora.
 */
@Injectable()
export class AceiteDaPoliticaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly privacidade: PrivacidadeService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const alvos = [contexto.getHandler(), contexto.getClass()];

    if (
      this.reflector.getAllAndOverride<boolean | undefined>(PUBLICO_KEY, alvos) === true ||
      this.reflector.getAllAndOverride<boolean | undefined>(SEM_ACEITE_KEY, alvos) === true
    ) {
      return true;
    }

    const req = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();

    // Sem usuário o JwtAuthGuard já teria recusado; não é papel deste guard.
    if (req.usuario === undefined) {
      return true;
    }

    if (await this.privacidade.aceitouVigente(req.usuario.id)) {
      return true;
    }

    throw new AceiteDaPoliticaPendenteError(politicaVigente().versao);
  }
}
