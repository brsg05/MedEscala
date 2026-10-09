import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../../shared/config/env';
import { CredenciaisInvalidasError, SessaoExpiradaError } from '../../shared/errors/dominio.error';
import type { ParDeTokens } from './sessao.cookies';

export interface IdentidadeSupabase {
  id: string;
  email: string;
}

/**
 * Única fronteira com o Supabase Auth (GoTrue).
 *
 * O Supabase é dono da credencial — senha, hash, confirmação de e-mail, rotação do
 * refresh. O resto do sistema não importa `@supabase/supabase-js`: se a autenticação
 * mudar de provedor, muda este arquivo e mais nada. É o mesmo raciocínio do ADR-008
 * para `EmissorFiscal` e `GatewayPagamento`.
 */
@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);

  /** Cliente público: usado para o login com senha do próprio usuário. */
  private readonly anon: SupabaseClient;

  /** Cliente privilegiado: ignora RLS. Nunca pode vazar para fora da api (D2). */
  private readonly admin: SupabaseClient;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('SUPABASE_URL', { infer: true });
    const semSessao = {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    };

    this.anon = createClient(url, config.get('SUPABASE_ANON_KEY', { infer: true }), semSessao);
    this.admin = createClient(
      url,
      config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }),
      semSessao,
    );
  }

  /** Cliente privilegiado, para o seed criar usuários. */
  get clienteAdmin(): SupabaseClient {
    return this.admin;
  }

  async entrar(
    email: string,
    senha: string,
  ): Promise<{ tokens: ParDeTokens; usuario: IdentidadeSupabase }> {
    const { data, error } = await this.anon.auth.signInWithPassword({ email, password: senha });

    if (error !== null || data.session === null || data.user === null) {
      // Não logamos o motivo exato do Supabase em nível de erro: a distinção entre
      // "usuário inexistente" e "senha errada" não deve chegar ao cliente.
      this.logger.debug(`Falha de login para ${email}: ${error?.message ?? 'sessão vazia'}`);
      throw new CredenciaisInvalidasError();
    }

    return {
      tokens: this.extrairTokens(data.session),
      usuario: { id: data.user.id, email: data.user.email ?? email },
    };
  }

  async renovar(
    refreshToken: string,
  ): Promise<{ tokens: ParDeTokens; usuario: IdentidadeSupabase }> {
    const { data, error } = await this.anon.auth.refreshSession({ refresh_token: refreshToken });

    if (error !== null || data.session === null || data.user === null) {
      throw new SessaoExpiradaError();
    }

    return {
      tokens: this.extrairTokens(data.session),
      usuario: { id: data.user.id, email: data.user.email ?? '' },
    };
  }

  /** Valida o access token e devolve a identidade. Base do `JwtAuthGuard`. */
  async identidadeDoToken(accessToken: string): Promise<IdentidadeSupabase> {
    const { data, error } = await this.anon.auth.getUser(accessToken);

    if (error !== null || data.user === null) {
      throw new SessaoExpiradaError();
    }

    return { id: data.user.id, email: data.user.email ?? '' };
  }

  /**
   * Cria a credencial no Supabase Auth. Devolve `null` se o e-mail já existe, para o
   * chamador traduzir em erro de domínio.
   *
   * `email_confirm: true` porque não há provedor de e-mail configurado (o F22 ainda
   * não escolheu um). Com e-mail, isto vira confirmação por link.
   */
  async criarCredencial(email: string, senha: string): Promise<string | null> {
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });

    if (error !== null || data.user === null) {
      this.logger.debug(
        `Falha ao criar credencial para ${email}: ${error?.message ?? 'sem usuário'}`,
      );
      return null;
    }

    return data.user.id;
  }

  /** Compensação: desfaz a credencial se o restante do cadastro falhar. */
  async removerCredencial(id: string): Promise<void> {
    const { error } = await this.admin.auth.admin.deleteUser(id);

    if (error !== null) {
      // Não relança: quem chama já está tratando uma falha anterior, e esta é a
      // segunda. Fica registrada para limpeza manual.
      this.logger.error(`Credencial órfã no Supabase Auth: ${id} (${error.message})`);
    }
  }

  private extrairTokens(sessao: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  }): ParDeTokens {
    return {
      accessToken: sessao.access_token,
      refreshToken: sessao.refresh_token,
      expiraEmSegundos: sessao.expires_in ?? 3600,
    };
  }
}
