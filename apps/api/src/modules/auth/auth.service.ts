import { Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '@medescala/contracts';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CredenciaisInvalidasError } from '../../shared/errors/dominio.error';
import { PerfilAcessoService } from './perfil-acesso.service';
import { RefreshTokenService } from './refresh-token.service';
import { SupabaseAuthService } from './supabase-auth.service';
import type { ParDeTokens } from './sessao.cookies';

export interface SessaoCriada {
  usuario: UsuarioAutenticado;
  tokens: ParDeTokens;
  csrfToken: string;
}

export interface SessaoRenovada {
  tokens: ParDeTokens;
  csrfToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseAuthService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly perfilAcesso: PerfilAcessoService,
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async login(email: string, senha: string): Promise<SessaoCriada> {
    const { tokens, usuario: identidade } = await this.supabase.entrar(email, senha);

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: identidade.id },
      select: { id: true, email: true, nome: true },
    });

    if (usuario === null) {
      // Credencial válida no Supabase, mas sem contrapartida no domínio. Tratamos
      // como credencial inválida: dizer "existe mas está incompleto" entregaria
      // informação sobre a base de usuários.
      throw new CredenciaisInvalidasError();
    }

    await this.refreshTokens.iniciarFamilia(usuario.id, tokens.refreshToken);
    const perfis = await this.perfilAcesso.perfisDe(usuario.id);

    await this.auditoria.registrar({
      acao: 'SESSAO_INICIADA',
      entidade: 'Usuario',
      entidadeId: usuario.id,
      atorId: usuario.id,
      estadoNovo: 'AUTENTICADO',
    });

    return {
      usuario: { ...usuario, perfis: [...perfis] },
      tokens,
      csrfToken: RefreshTokenService.novoCsrfToken(),
    };
  }

  /**
   * Renova a sessão. A ordem importa: validamos o token local ANTES de falar com o
   * Supabase, para que um token já usado dispare a revogação da família sem gastar
   * uma chamada de rede.
   */
  async renovar(refreshTokenAtual: string): Promise<SessaoRenovada> {
    const { usuarioId, familia } = await this.refreshTokens.validar(refreshTokenAtual);

    const { tokens } = await this.supabase.renovar(refreshTokenAtual);

    await this.refreshTokens.rotacionar({
      usuarioId,
      familia,
      tokenAntigo: refreshTokenAtual,
      tokenNovo: tokens.refreshToken,
    });

    return { tokens, csrfToken: RefreshTokenService.novoCsrfToken() };
  }

  async logout(refreshToken: string | undefined, usuarioId: string | undefined): Promise<void> {
    if (refreshToken !== undefined && refreshToken.length > 0) {
      await this.refreshTokens.revogarPorToken(refreshToken);
    }

    if (usuarioId !== undefined) {
      this.perfilAcesso.invalidar(usuarioId);

      await this.auditoria.registrar({
        acao: 'SESSAO_ENCERRADA',
        entidade: 'Usuario',
        entidadeId: usuarioId,
        atorId: usuarioId,
        estadoAnterior: 'AUTENTICADO',
        estadoNovo: 'ENCERRADO',
      });
    }
  }
}
