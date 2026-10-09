import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { COOKIE_CSRF_TOKEN, HEADER_CSRF_TOKEN } from '@medescala/contracts';
import type { Env } from '../../../shared/config/env';
import { CsrfInvalidoError, OrigemNaoPermitidaError } from '../../../shared/errors/dominio.error';
import { SEM_CSRF_KEY } from '../decorators/sem-csrf.decorator';

/** Métodos que alteram estado. GET/HEAD/OPTIONS não precisam de proteção CSRF. */
const METODOS_DE_MUTACAO = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Anti-CSRF em duas camadas (D9), aplicado a toda mutação.
 *
 * 1. `Origin`: a requisição tem que vir da origem conhecida do frontend. Navegador
 *    não deixa página de terceiro forjar este header.
 * 2. Double-submit: o valor do cookie de CSRF tem que bater com o do header. Um site
 *    atacante consegue FAZER o navegador enviar o cookie, mas não consegue LER o
 *    valor para montar o header — same-origin policy.
 *
 * As duas juntas cobrem os casos em que uma falha isoladamente: `Origin` ausente em
 * cliente não-navegador, e cookie de CSRF vazado por subdomínio.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly origemPermitida: string;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    this.origemPermitida = config.get('WEB_ORIGIN', { infer: true });
  }

  canActivate(contexto: ExecutionContext): boolean {
    const req = contexto.switchToHttp().getRequest<Request>();

    if (!METODOS_DE_MUTACAO.has(req.method)) {
      return true;
    }

    this.verificarOrigem(req);

    const dispensado = this.reflector.getAllAndOverride<boolean | undefined>(SEM_CSRF_KEY, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    if (dispensado === true) {
      return true;
    }

    this.verificarDoubleSubmit(req);

    return true;
  }

  private verificarOrigem(req: Request): void {
    // `Origin` é o sinal confiável; `Referer` é o retrocesso para navegadores antigos.
    const origem = req.get('origin') ?? this.origemDeReferer(req.get('referer'));

    if (origem !== this.origemPermitida) {
      throw new OrigemNaoPermitidaError(origem);
    }
  }

  private origemDeReferer(referer: string | undefined): string | undefined {
    if (referer === undefined) {
      return undefined;
    }

    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }

  private verificarDoubleSubmit(req: Request): void {
    const doCookie: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
      COOKIE_CSRF_TOKEN
    ];
    const doHeader = req.get(HEADER_CSRF_TOKEN);

    if (typeof doCookie !== 'string' || doCookie.length === 0 || doHeader === undefined) {
      throw new CsrfInvalidoError();
    }

    const a = Buffer.from(doCookie);
    const b = Buffer.from(doHeader);

    // Comparação em tempo constante: comprimento diferente já é divergência.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new CsrfInvalidoError();
    }
  }
}
