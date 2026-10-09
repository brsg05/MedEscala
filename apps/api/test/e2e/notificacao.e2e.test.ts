import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_CSRF_TOKEN, HEADER_CSRF_TOKEN } from '@medescala/contracts';
import { criarAppDeTeste, cookiesDe, limparPlantoesDoSetor, valorDoCookie } from './app-de-teste';

const ORIGEM = 'http://localhost:5173';
const SENHA = process.env['SEED_SENHA_PADRAO'] ?? 'medescala123';
const SETOR_ID = '22222222-2222-4222-8222-222222222222';
const HOSPITAL_CNPJ = '12345678000190';

const TITULAR = 'titular.e2e@medescala.test';
const SUBSTITUTO = 'substituto.e2e@medescala.test';
const TERCEIRO = 'terceiro.e2e@medescala.test';
const CHEFIA = 'chefia@medescala.test';

interface Sessao {
  cookies: string[];
  csrf: string;
}

interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string;
  link: string | null;
  lida: boolean;
}

interface Lista {
  naoLidas: number;
  itens: Notificacao[];
}

/**
 * F22 — notificações in-app (DEC-121, DEC-127 a DEC-129).
 *
 * Os usuários de teste acumulam avisos entre execuções, então as asserções
 * procuram o aviso DESTE repasse (pelo texto ou pela diferença), nunca contam o
 * total. Plantões a mais de 900 dias, longe das outras suítes.
 */
describe('notificações in-app (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let deslocamento = 900;

  beforeAll(async () => {
    app = await criarAppDeTeste();
    prisma = new PrismaClient();
    await prisma.$connect();
    await limparPlantoesDoSetor(prisma, SETOR_ID);
  });

  afterAll(async () => {
    await limparPlantoesDoSetor(prisma, SETOR_ID);
    await prisma.$disconnect();
    await app?.close();
  });

  const http = (): ReturnType<typeof request> => request(app.getHttpServer());

  async function entrar(email: string): Promise<Sessao> {
    const r = await http()
      .post('/auth/login')
      .set('Origin', ORIGEM)
      .send({ email, senha: SENHA })
      .expect(200);
    const cookies = cookiesDe(r);
    return { cookies, csrf: valorDoCookie(cookies, COOKIE_CSRF_TOKEN) ?? '' };
  }

  function comSessao(req: request.Test, s: Sessao): request.Test {
    return req.set('Origin', ORIGEM).set('Cookie', s.cookies).set(HEADER_CSRF_TOKEN, s.csrf);
  }

  async function avisos(s: Sessao): Promise<Lista> {
    const r = await http().get('/notificacoes').set('Cookie', s.cookies).expect(200);
    return r.body as Lista;
  }

  async function idDoMedico(email: string): Promise<string> {
    const u = await prisma.usuario.findUnique({
      where: { email },
      include: { medico: { select: { id: true } } },
    });
    return u?.medico?.id ?? '';
  }

  /** Plantão novo, escalado para o titular. */
  async function plantaoDoTitular(): Promise<string> {
    deslocamento += 2;
    const chefia = await entrar(CHEFIA);
    const inicio = new Date(Date.now() + deslocamento * 86_400_000);

    const vaga = await comSessao(http().post('/plantoes'), chefia)
      .send({
        setorId: SETOR_ID,
        inicio: inicio.toISOString(),
        fim: new Date(inicio.getTime() + 12 * 3_600_000).toISOString(),
        valorCentavos: 120_000,
        especialidadeExigida: 'Clínica Médica',
        requisitos: [],
        modeloContratacao: 'PJ',
      })
      .expect(201);

    const plantaoId = (vaga.body as { id: string }).id;
    await comSessao(http().post(`/plantoes/${plantaoId}/atribuir`), chefia)
      .send({ medicoId: await idDoMedico(TITULAR) })
      .expect(201);

    return plantaoId;
  }

  async function abrir(plantaoId: string, indicados: string[]): Promise<string> {
    const titular = await entrar(TITULAR);
    const r = await comSessao(http().post(`/plantoes/${plantaoId}/repasses`), titular)
      .send({ motivo: 'Teste das notificações in-app', indicados })
      .expect(201);
    return (r.body as { id: string }).id;
  }

  /** Avisos de uma entidade, direto do banco — para conferir quem recebeu o quê. */
  async function doBanco(entidadeId: string, email: string): Promise<string[]> {
    const ns = await prisma.notificacao.findMany({
      where: { entidadeId, usuario: { email } },
      orderBy: { criadaEm: 'asc' },
    });
    return ns.map((n) => n.tipo);
  }

  // ---------------------------------------------------------------------------

  it('sem sessão, 401', async () => {
    await http().get('/notificacoes').expect(401);
  });

  it('escalar avisa o médico escalado', async () => {
    const plantaoId = await plantaoDoTitular();
    expect(await doBanco(plantaoId, TITULAR)).toEqual(['MEDICO_ESCALADO']);
  });

  it('o convidado da vez recebe o convite, com prazo e link para Decisões', async () => {
    const subId = await idDoMedico(SUBSTITUTO);
    const repasseId = await abrir(await plantaoDoTitular(), [subId]);

    const sub = await entrar(SUBSTITUTO);
    const lista = await avisos(sub);
    const convite = lista.itens.find(
      (n) => n.tipo === 'CONVITE_RECEBIDO' && !n.lida && n.corpo.includes('Responda até'),
    );

    expect(convite).toBeDefined();
    expect(convite?.link).toBe('/decisoes');
    expect(await doBanco(repasseId, SUBSTITUTO)).toEqual(['CONVITE_RECEBIDO']);
  });

  it('aceite avisa o titular e as chefias; aprovação avisa titular e substituto', async () => {
    const subId = await idDoMedico(SUBSTITUTO);
    const repasseId = await abrir(await plantaoDoTitular(), [subId]);

    const sub = await entrar(SUBSTITUTO);
    await comSessao(http().post(`/repasses/${repasseId}/aceitar`), sub)
      .send({})
      .expect(200);

    expect(await doBanco(repasseId, TITULAR)).toEqual(['SUBSTITUTO_ACEITOU']);
    expect(await doBanco(repasseId, CHEFIA)).toEqual(['APROVACAO_PENDENTE']);

    const hospital = await prisma.instituicao.findUniqueOrThrow({
      where: { cnpj: HOSPITAL_CNPJ },
    });
    const pendente = await prisma.notificacao.findFirstOrThrow({
      where: { entidadeId: repasseId, tipo: 'APROVACAO_PENDENTE' },
    });
    expect(pendente.link).toBe(`/instituicao/${hospital.id}/decisoes`);

    const chefia = await entrar(CHEFIA);
    await comSessao(http().post(`/repasses/${repasseId}/aprovar`), chefia)
      .send({})
      .expect(200);

    expect(await doBanco(repasseId, TITULAR)).toEqual(['SUBSTITUTO_ACEITOU', 'REPASSE_APROVADO']);
    expect(await doBanco(repasseId, SUBSTITUTO)).toEqual(['CONVITE_RECEBIDO', 'REPASSE_APROVADO']);
  });

  it('recusa do convite avisa o titular, e o próximo da fila recebe o convite', async () => {
    const subId = await idDoMedico(SUBSTITUTO);
    const terId = await idDoMedico(TERCEIRO);
    const repasseId = await abrir(await plantaoDoTitular(), [subId, terId]);

    const sub = await entrar(SUBSTITUTO);
    await comSessao(http().post(`/repasses/${repasseId}/recusar-convite`), sub)
      .send({})
      .expect(200);

    expect(await doBanco(repasseId, TITULAR)).toEqual(['CONVITE_RECUSADO']);
    expect(await doBanco(repasseId, TERCEIRO)).toEqual(['CONVITE_RECEBIDO']);
  });

  it('ação recusada não gera aviso — a notificação vive na transação (DEC-128)', async () => {
    const subId = await idDoMedico(SUBSTITUTO);
    const terId = await idDoMedico(TERCEIRO);
    const repasseId = await abrir(await plantaoDoTitular(), [subId, terId]);

    // Fora da vez: 409, e o titular não fica sabendo de um aceite que não houve.
    const terceiro = await entrar(TERCEIRO);
    await comSessao(http().post(`/repasses/${repasseId}/aceitar`), terceiro)
      .send({})
      .expect(409);

    expect(await doBanco(repasseId, TITULAR)).toEqual([]);
  });

  it('cancelar avisa quem estava com o convite', async () => {
    const subId = await idDoMedico(SUBSTITUTO);
    const repasseId = await abrir(await plantaoDoTitular(), [subId]);

    const titular = await entrar(TITULAR);
    await comSessao(http().post(`/repasses/${repasseId}/cancelar`), titular)
      .send({})
      .expect(200);

    expect(await doBanco(repasseId, SUBSTITUTO)).toEqual(['CONVITE_RECEBIDO', 'CONVITE_CANCELADO']);
  });

  it('marcar como lida baixa a contagem; marcar todas zera', async () => {
    const subId = await idDoMedico(SUBSTITUTO);
    await abrir(await plantaoDoTitular(), [subId]);

    const sub = await entrar(SUBSTITUTO);
    const antes = await avisos(sub);
    const alvo = antes.itens.find((n) => !n.lida);
    expect(alvo).toBeDefined();

    await comSessao(http().post(`/notificacoes/${alvo?.id ?? ''}/lida`), sub)
      .send({})
      .expect(204);
    expect((await avisos(sub)).naoLidas).toBe(antes.naoLidas - 1);

    await comSessao(http().post('/notificacoes/lidas'), sub).send({}).expect(204);
    expect((await avisos(sub)).naoLidas).toBe(0);
  });

  it('aviso de outra pessoa responde como inexistente (ADR-026)', async () => {
    const subId = await idDoMedico(SUBSTITUTO);
    const repasseId = await abrir(await plantaoDoTitular(), [subId]);

    const doSubstituto = await prisma.notificacao.findFirstOrThrow({
      where: { entidadeId: repasseId, usuario: { email: SUBSTITUTO } },
    });

    const terceiro = await entrar(TERCEIRO);
    await comSessao(http().post(`/notificacoes/${doSubstituto.id}/lida`), terceiro)
      .send({})
      .expect(404);

    const intacta = await prisma.notificacao.findUniqueOrThrow({ where: { id: doSubstituto.id } });
    expect(intacta.lidaEm).toBeNull();
  });
});
