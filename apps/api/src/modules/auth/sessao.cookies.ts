import type { CookieOptions, Response } from 'express';
import { COOKIE_ACCESS_TOKEN, COOKIE_CSRF_TOKEN, COOKIE_REFRESH_TOKEN } from '@medescala/contracts';

/**
 * Política de cookies da sessão (D9).
 *
 * - access e refresh são `httpOnly`: JS não os lê, então XSS não os rouba;
 * - o cookie de CSRF é deliberadamente LEGÍVEL pelo JS — ele existe para ser
 *   reenviado no header e comparado com o cookie (double-submit). Não é segredo:
 *   a proteção vem de o atacante cross-site não conseguir LER o valor para montar
 *   o header, graças à same-origin policy;
 * - `sameSite: 'lax'` e não `'strict'` porque o convite de plantão chega por e-mail
 *   (F22) e um link externo precisa abrir o app com a sessão viva;
 * - o refresh fica restrito a `/auth`: ele não é enviado nas chamadas normais de
 *   API, reduzindo a superfície de vazamento em log de proxy.
 */
const CAMINHO_REFRESH = '/auth';

function base(producao: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: producao,
    sameSite: 'lax',
    path: '/',
  };
}

export interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
  /** Segundos até o access token expirar, como o Supabase informa. */
  expiraEmSegundos: number;
}

export function gravarCookiesDeSessao(
  resposta: Response,
  tokens: ParDeTokens,
  csrfToken: string,
  producao: boolean,
): void {
  const comum = base(producao);

  resposta.cookie(COOKIE_ACCESS_TOKEN, tokens.accessToken, {
    ...comum,
    maxAge: tokens.expiraEmSegundos * 1000,
  });

  resposta.cookie(COOKIE_REFRESH_TOKEN, tokens.refreshToken, {
    ...comum,
    path: CAMINHO_REFRESH,
  });

  resposta.cookie(COOKIE_CSRF_TOKEN, csrfToken, {
    ...comum,
    httpOnly: false, // proposital — ver comentário do módulo
  });
}

export function limparCookiesDeSessao(resposta: Response, producao: boolean): void {
  const comum = base(producao);

  resposta.clearCookie(COOKIE_ACCESS_TOKEN, comum);
  resposta.clearCookie(COOKIE_REFRESH_TOKEN, { ...comum, path: CAMINHO_REFRESH });
  resposta.clearCookie(COOKIE_CSRF_TOKEN, { ...comum, httpOnly: false });
}
