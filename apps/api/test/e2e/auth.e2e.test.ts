import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_CSRF_TOKEN,
  COOKIE_REFRESH_TOKEN,
  HEADER_CSRF_TOKEN,
} from '@medescala/contracts';
import { criarAppDeTeste, cookiesDe, valorDoCookie } from './app-de-teste';

const ORIGEM = 'http://localhost:5173';
const SENHA = process.env['SEED_SENHA_PADRAO'] ?? 'medescala123';

const MEDICO = 'medico@medescala.test';
const CHEFIA = 'chefia@medescala.test';

/**
 * Critério de aceite do Sprint 0: "rota protegida devolve 401 sem token e 403 com
 * perfil errado" — mais as decisões D9 (cookie httpOnly, rotação, anti-CSRF).
 *
 * Exige `pnpm exec supabase start` e `pnpm db:seed` antes.
 */
describe('autenticação e autorização (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await criarAppDeTeste();
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = (): ReturnType<typeof request> => request(app.getHttpServer());

  async function logar(email: string): Promise<{ cookies: string[]; csrf: string }> {
    const resposta = await http()
      .post('/auth/login')
      .set('Origin', ORIGEM)
      .send({ email, senha: SENHA })
      .expect(200);

    return {
      cookies: cookiesDe(resposta),
      csrf: (resposta.body as { csrfToken: string }).csrfToken,
    };
  }

  describe('rota pública', () => {
    it('responde sem sessão', async () => {
      const r = await http().get('/saude').expect(200);
      expect(r.body).toMatchObject({ status: 'ok', banco: 'ok' });
    });
  });

  describe('401 — sem sessão', () => {
    it('recusa /auth/me sem cookie', async () => {
      const r = await http().get('/auth/me').expect(401);
      expect((r.body as { codigo: string }).codigo).toBe('NAO_AUTENTICADO');
    });

    it('recusa rota protegida sem cookie', async () => {
      await http().get('/_teste/autenticado').expect(401);
    });

    it('recusa credencial inválida sem revelar se o e-mail existe', async () => {
      const r = await http()
        .post('/auth/login')
        .set('Origin', ORIGEM)
        .send({ email: MEDICO, senha: 'senha-errada-mas-longa' })
        .expect(401);

      expect((r.body as { codigo: string }).codigo).toBe('CREDENCIAIS_INVALIDAS');
      expect((r.body as { mensagem: string }).mensagem).toBe('E-mail ou senha inválidos');
    });
  });

  describe('login', () => {
    it('devolve a sessão em cookie httpOnly e nunca token no corpo', async () => {
      const resposta = await http()
        .post('/auth/login')
        .set('Origin', ORIGEM)
        .send({ email: MEDICO, senha: SENHA })
        .expect(200);

      const bruto = resposta.headers['set-cookie'] as unknown as string[];
      const access = bruto.find((c) => c.startsWith(COOKIE_ACCESS_TOKEN));
      const refresh = bruto.find((c) => c.startsWith(COOKIE_REFRESH_TOKEN));
      const csrf = bruto.find((c) => c.startsWith(COOKIE_CSRF_TOKEN));

      expect(access).toMatch(/HttpOnly/iu);
      expect(refresh).toMatch(/HttpOnly/iu);
      // O de CSRF é legível pelo JS de propósito — é reenviado no header.
      expect(csrf).not.toMatch(/HttpOnly/iu);
      // Refresh restrito a /auth: não trafega nas chamadas normais de API.
      expect(refresh).toMatch(/Path=\/auth/iu);

      const corpo = JSON.stringify(resposta.body);
      expect(corpo).not.toContain('access_token');
      expect(corpo).not.toContain('refresh_token');
      expect(resposta.body).toHaveProperty('usuario.perfis');
    });

    it('recusa entrada fora do schema Zod de contracts', async () => {
      const r = await http()
        .post('/auth/login')
        .set('Origin', ORIGEM)
        .send({ email: 'nao-e-email', senha: 'curta' })
        .expect(400);

      expect((r.body as { codigo: string }).codigo).toBe('ENTRADA_INVALIDA');
    });
  });

  describe('403 — perfil errado (ADR-006)', () => {
    it('deixa a chefia entrar na rota da chefia', async () => {
      const { cookies } = await logar(CHEFIA);
      await http().get('/_teste/chefia').set('Cookie', cookies).expect(200);
    });

    it('recusa o médico na rota da chefia', async () => {
      const { cookies } = await logar(MEDICO);

      const r = await http().get('/_teste/chefia').set('Cookie', cookies).expect(403);

      expect((r.body as { codigo: string }).codigo).toBe('PERFIL_INSUFICIENTE');
    });

    it('deixa qualquer autenticado numa rota sem @Perfis', async () => {
      const { cookies } = await logar(MEDICO);
      await http().get('/_teste/autenticado').set('Cookie', cookies).expect(200);
    });
  });

  describe('anti-CSRF (D9)', () => {
    it('recusa mutação sem o header de CSRF', async () => {
      const { cookies } = await logar(CHEFIA);

      const r = await http()
        .post('/_teste/chefia')
        .set('Origin', ORIGEM)
        .set('Cookie', cookies)
        .expect(403);

      expect((r.body as { codigo: string }).codigo).toBe('CSRF_INVALIDO');
    });

    it('recusa mutação com header divergente do cookie', async () => {
      const { cookies } = await logar(CHEFIA);

      await http()
        .post('/_teste/chefia')
        .set('Origin', ORIGEM)
        .set('Cookie', cookies)
        .set(HEADER_CSRF_TOKEN, 'valor-que-nao-bate')
        .expect(403);
    });

    it('aceita mutação com cookie e header coincidentes', async () => {
      const { cookies } = await logar(CHEFIA);
      const csrf = valorDoCookie(cookies, COOKIE_CSRF_TOKEN);

      await http()
        .post('/_teste/chefia')
        .set('Origin', ORIGEM)
        .set('Cookie', cookies)
        .set(HEADER_CSRF_TOKEN, csrf ?? '')
        .expect(201);
    });

    it('recusa mutação vinda de origem estranha', async () => {
      const { cookies } = await logar(CHEFIA);
      const csrf = valorDoCookie(cookies, COOKIE_CSRF_TOKEN);

      const r = await http()
        .post('/_teste/chefia')
        .set('Origin', 'http://site-malicioso.example')
        .set('Cookie', cookies)
        .set(HEADER_CSRF_TOKEN, csrf ?? '')
        .expect(403);

      expect((r.body as { codigo: string }).codigo).toBe('ORIGEM_NAO_PERMITIDA');
    });
  });

  describe('rotação de refresh (D9)', () => {
    it('emite novos cookies e invalida o refresh anterior', async () => {
      const { cookies } = await logar(MEDICO);
      const csrf = valorDoCookie(cookies, COOKIE_CSRF_TOKEN);

      const primeira = await http()
        .post('/auth/refresh')
        .set('Origin', ORIGEM)
        .set('Cookie', cookies)
        .set(HEADER_CSRF_TOKEN, csrf ?? '')
        .expect(200);

      expect(primeira.body).toHaveProperty('csrfToken');

      // Reusar o MESMO refresh precisa falhar — é a detecção de roubo de token.
      const segunda = await http()
        .post('/auth/refresh')
        .set('Origin', ORIGEM)
        .set('Cookie', cookies)
        .set(HEADER_CSRF_TOKEN, csrf ?? '')
        .expect(401);

      expect((segunda.body as { codigo: string }).codigo).toBe('REFRESH_TOKEN_INVALIDO');
    });
  });

  describe('logout', () => {
    it('limpa os cookies e derruba a sessão', async () => {
      const { cookies } = await logar(MEDICO);
      const csrf = valorDoCookie(cookies, COOKIE_CSRF_TOKEN);

      await http()
        .post('/auth/logout')
        .set('Origin', ORIGEM)
        .set('Cookie', cookies)
        .set(HEADER_CSRF_TOKEN, csrf ?? '')
        .expect(204);

      await http()
        .post('/auth/refresh')
        .set('Origin', ORIGEM)
        .set('Cookie', cookies)
        .set(HEADER_CSRF_TOKEN, csrf ?? '')
        .expect(401);
    });
  });
});
