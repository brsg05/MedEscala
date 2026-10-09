import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { COOKIE_ACCESS_TOKEN } from '@medescala/contracts';
import { NaoAutenticadoError } from '../../../shared/errors/dominio.error';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { PUBLICO_KEY } from '../decorators/publico.decorator';
import { PerfilAcessoService } from '../perfil-acesso.service';
import { SupabaseAuthService } from '../supabase-auth.service';
import type { RequisicaoAutenticada } from '../tipos';

/**
 * Guard global: por padrão toda rota exige sessão. Abrir uma rota exige `@Publico()`,
 * que é explícito e aparece no diff — o oposto de esquecer de proteger, que é mudo.
 *
 * Lê o access token do cookie `httpOnly`, valida no Supabase e resolve os perfis
 * (D8). O resultado é anexado à requisição para o `PerfisGuard` e o `@UsuarioAtual()`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseAuthService,
    private readonly perfilAcesso: PerfilAcessoService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean | undefined>(PUBLICO_KEY, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    if (publico === true) {
      return true;
    }

    const req = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const token: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
      COOKIE_ACCESS_TOKEN
    ];

    if (typeof token !== 'string' || token.length === 0) {
      throw new NaoAutenticadoError();
    }

    // Lança SessaoExpiradaError (401) se o token for inválido ou estiver vencido.
    const identidade = await this.supabase.identidadeDoToken(token);

    const [usuario, perfis] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { id: identidade.id },
        select: { id: true, email: true, nome: true },
      }),
      this.perfilAcesso.perfisDe(identidade.id),
    ]);

    if (usuario === null) {
      // Existe no Supabase Auth mas não no domínio: cadastro incompleto ou usuário
      // criado direto no Studio sem passar pelo fluxo da api.
      throw new NaoAutenticadoError();
    }

    req.usuario = {
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      perfis: [...perfis],
    };

    return true;
  }
}
