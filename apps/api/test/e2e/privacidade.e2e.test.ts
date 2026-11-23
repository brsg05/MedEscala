import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_CSRF_TOKEN, HEADER_CSRF_TOKEN, politicaVigente } from '@medescala/contracts';
import { SupabaseAuthService } from '../../src/modules/auth/supabase-auth.service';
import { criarAppDeTeste, cookiesDe, valorDoCookie } from './app-de-teste';

const ORIGEM = 'http://localhost:5173';
const VIGENTE = politicaVigente().versao;

interface Sessao {
  cookies: string[];
  csrf: string;
}

/**
 * F24 — política versionada e aceite (ADR-015, DEC-224 a DEC-227).
 *
 * Cada teste que precisa de conta cria a sua pelo cadastro, e o `afterAll`
 * remove a credencial — o que leva usuário, médico e aceite em cascata.
 */
describe('privacidade (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const emailsCriados: string[] = [];

  beforeAll(async () => {
    app = await criarAppDeTeste();
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    const medicos = await prisma.medico.findMany({
      where: { usuario: { email: { in: emailsCriados } } },
      select: { id: true },
    });
    await prisma.notificacao.deleteMany({
      where: { entidadeId: { in: medicos.map((m) => m.id) } },
    });
    const supabase = app.get(SupabaseAuthService);
    const usuarios = await prisma.usuario.findMany({
      where: { email: { in: emailsCriados } },
      select: { id: true },
    });
    for (const u of usuarios) {
      await supabase.removerCredencial(u.id);
    }
    await prisma.$disconnect();
    await app?.close();
  });

  const http = (): ReturnType<typeof request> => request(app.getHttpServer());

  function comSessao(req: request.Test, s: Sessao): request.Test {
    return req.set('Origin', ORIGEM).set('Cookie', s.cookies).set(HEADER_CSRF_TOKEN, s.csrf);
  }

  function dadosDeCadastro(aceitePolitica?: string): Record<string, unknown> {
    const email = `lgpd.${randomUUID().slice(0, 8)}@teste.medescala`;
    emailsCriados.push(email);
    return {
      tipo: 'MEDICO',
      nome: 'Médica da Privacidade',
      email,
      senha: 'senha-segura-1',
      crm: String(Math.floor(100000 + Math.random() * 899999)),
      crmUf: 'PE',
      especialidade: 'Clínica Médica',
      ...(aceitePolitica === undefined ? {} : { aceitePolitica }),
    };
  }

  async function cadastrar(): Promise<{ sessao: Sessao; email: string }> {
    const dados = dadosDeCadastro(VIGENTE);
    const r = await http().post('/auth/cadastro').set('Origin', ORIGEM).send(dados).expect(201);
    const cookies = cookiesDe(r);
    return {
      sessao: { cookies, csrf: valorDoCookie(cookies, COOKIE_CSRF_TOKEN) ?? '' },
      email: dados['email'] as string,
    };
  }

  it('a política é pública, com finalidade, base legal e retenção por categoria', async () => {
    const r = await http().get('/privacidade/politica').expect(200);
    const corpo = r.body as {
      versao: string;
      hash: string;
      itens: Array<{ finalidade: string; baseLegal: string; retencao: string }>;
    };

    expect(corpo.versao).toBe(VIGENTE);
    expect(corpo.hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(corpo.itens.length).toBeGreaterThan(0);
  });

  it('não cria conta sem aceite da política', async () => {
    await http().post('/auth/cadastro').set('Origin', ORIGEM).send(dadosDeCadastro()).expect(400);
  });

  it('não cria conta com aceite de versão que não é a vigente — nem a credencial', async () => {
    const dados = dadosDeCadastro('2000-01-v0');
    const r = await http().post('/auth/cadastro').set('Origin', ORIGEM).send(dados).expect(409);

    expect((r.body as { codigo: string }).codigo).toBe('POLITICA_DESATUALIZADA');
    expect(
      await prisma.usuario.findUnique({ where: { email: dados['email'] as string } }),
    ).toBeNull();
  });

  it('o cadastro grava o aceite com o hash do texto, e ele aparece na trilha', async () => {
    const { sessao, email } = await cadastrar();

    const aceite = await prisma.aceitePolitica.findFirst({ where: { usuario: { email } } });
    const politica = (await http().get('/privacidade/politica')).body as { hash: string };
    expect(aceite?.versao).toBe(VIGENTE);
    expect(aceite?.hashTexto).toBe(politica.hash);

    const evento = await prisma.eventoAuditoria.findFirst({
      where: { acao: 'POLITICA_DE_PRIVACIDADE_ACEITA', entidadeId: aceite?.id ?? '' },
    });
    expect(evento).not.toBeNull();

    const situacao = await comSessao(http().get('/privacidade/aceite'), sessao).expect(200);
    expect(situacao.body).toMatchObject({ versaoVigente: VIGENTE, pendente: false });
  });

  it('sem aceite da vigente, só sessão e privacidade respondem (428 no resto)', async () => {
    const { sessao, email } = await cadastrar();
    // Simula uma versão nova publicada depois do aceite: o aceite da vigente some.
    // DELETE só é permitido aqui por ser teste; nenhum caminho da api apaga aceite.
    await prisma.aceitePolitica.deleteMany({ where: { usuario: { email } } });

    const r = await comSessao(http().get('/medicos/me'), sessao).expect(428);
    expect((r.body as { codigo: string }).codigo).toBe('ACEITE_DA_POLITICA_PENDENTE');

    await comSessao(http().get('/auth/me'), sessao).expect(200);
    const situacao = await comSessao(http().get('/privacidade/aceite'), sessao).expect(200);
    expect(situacao.body).toMatchObject({ pendente: true, versaoAceita: null });

    const velha = await comSessao(http().post('/privacidade/aceite'), sessao)
      .send({ versao: '2000-01-v0' })
      .expect(409);
    expect((velha.body as { codigo: string }).codigo).toBe('POLITICA_DESATUALIZADA');

    await comSessao(http().post('/privacidade/aceite'), sessao)
      .send({ versao: VIGENTE })
      .expect(200);
    await comSessao(http().get('/medicos/me'), sessao).expect(200);
  });

  it('aceitar de novo a mesma versão não duplica o registro', async () => {
    const { sessao, email } = await cadastrar();

    await comSessao(http().post('/privacidade/aceite'), sessao)
      .send({ versao: VIGENTE })
      .expect(200);

    expect(await prisma.aceitePolitica.count({ where: { usuario: { email } } })).toBe(1);
  });
});
