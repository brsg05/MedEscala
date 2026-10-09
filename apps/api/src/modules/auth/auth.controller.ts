import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  CadastroRequest,
  COOKIE_REFRESH_TOKEN,
  LoginRequest,
  type LoginResponse,
  type MeResponse,
  type RefreshResponse,
} from '@medescala/contracts';
import type { Env } from '../../shared/config/env';
import { ZodValidationPipe } from '../../shared/validacao/zod-validation.pipe';
import { NaoAutenticadoError } from '../../shared/errors/dominio.error';
import { AuthService } from './auth.service';
import { CadastroService } from './cadastro.service';
import { Publico } from './decorators/publico.decorator';
import { SemCsrf } from './decorators/sem-csrf.decorator';
import { UsuarioAtual } from './decorators/usuario-atual.decorator';
import { gravarCookiesDeSessao, limparCookiesDeSessao } from './sessao.cookies';
import type { RequisicaoAutenticada } from './tipos';

@Controller('auth')
export class AuthController {
  private readonly producao: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly cadastro: CadastroService,
    config: ConfigService<Env, true>,
  ) {
    this.producao = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  /**
   * F-auth — início de sessão.
   *
   * `@SemCsrf` porque quem ainda não tem sessão não tem cookie de CSRF para
   * reenviar; a validação de `Origin` continua sendo aplicada pelo guard.
   */
  @Publico()
  @SemCsrf()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginRequest)) corpo: LoginRequest,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<LoginResponse> {
    const sessao = await this.auth.login(corpo.email, corpo.senha);

    gravarCookiesDeSessao(resposta, sessao.tokens, sessao.csrfToken, this.producao);

    // Repare que os tokens NÃO vão no corpo (D9) — só nos cookies httpOnly.
    return { usuario: sessao.usuario, csrfToken: sessao.csrfToken };
  }

  /**
   * Cadastro aberto (DEC-059, provisório) — cria a conta e já abre a sessão.
   *
   * `@SemCsrf` pelo mesmo motivo do login: quem ainda não tem conta não tem
   * cookie de CSRF. A validação de `Origin` continua valendo.
   */
  @Publico()
  @SemCsrf()
  @Post('cadastro')
  @HttpCode(HttpStatus.CREATED)
  async cadastrar(
    @Body(new ZodValidationPipe(CadastroRequest)) corpo: CadastroRequest,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<LoginResponse> {
    await this.cadastro.cadastrar(corpo);

    const sessao = await this.auth.login(corpo.email, corpo.senha);
    gravarCookiesDeSessao(resposta, sessao.tokens, sessao.csrfToken, this.producao);

    return { usuario: sessao.usuario, csrfToken: sessao.csrfToken };
  }

  /**
   * Renovação com rotação. É `@Publico` porque o access token pode estar vencido —
   * é exatamente por isso que se está renovando —, mas o CSRF continua exigido,
   * já que a chamada se apoia no cookie de refresh.
   */
  @Publico()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async renovar(
    @Req() requisicao: RequisicaoAutenticada,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<RefreshResponse> {
    const atual: unknown = (requisicao.cookies as Record<string, unknown> | undefined)?.[
      COOKIE_REFRESH_TOKEN
    ];

    if (typeof atual !== 'string' || atual.length === 0) {
      throw new NaoAutenticadoError();
    }

    const sessao = await this.auth.renovar(atual);

    gravarCookiesDeSessao(resposta, sessao.tokens, sessao.csrfToken, this.producao);

    return { csrfToken: sessao.csrfToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() requisicao: RequisicaoAutenticada,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<void> {
    const refresh: unknown = (requisicao.cookies as Record<string, unknown> | undefined)?.[
      COOKIE_REFRESH_TOKEN
    ];

    await this.auth.logout(
      typeof refresh === 'string' ? refresh : undefined,
      requisicao.usuario?.id,
    );

    limparCookiesDeSessao(resposta, this.producao);
  }

  /** Identidade e perfis da sessão corrente. O web chama no boot para reidratar. */
  @Get('me')
  me(@UsuarioAtual() usuario: MeResponse): MeResponse {
    return usuario;
  }
}
