import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_CSRF_TOKEN, HEADER_CSRF_TOKEN } from '@medescala/contracts';
import { criarAppDeTeste, cookiesDe, limparPlantoesDoSetor, valorDoCookie } from './app-de-teste';

const ORIGEM = 'http://localhost:5173';
const SENHA = process.env['SEED_SENHA_PADRAO'] ?? 'medescala123';
const SETOR_ID = '22222222-2222-4222-8222-222222222222';

const TITULAR = 'titular.e2e@medescala.test';
const SUBSTITUTO = 'substituto.e2e@medescala.test';
const TERCEIRO = 'terceiro.e2e@medescala.test';
const CHEFIA = 'chefia@medescala.test';

interface Sessao {
  cookies: string[];
  csrf: string;
}

interface Repasse {
  id: string;
  status: string;
  convidadoDaVez: { id: string } | null;
  origemConvite: string | null;
  filaEsgotada: boolean;
  prazoConviteAte: string | null;
}

/**
 * Fila de convites do repasse — DEC-087 a DEC-099.
 *
 * Plantões a mais de 500 dias: longe da janela de 14 dias do Bruno (seed) e dos
 * horários usados pela suíte de repasse, para nenhum convite cair onde não deve.
 */
describe('fila de convites (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let deslocamento = 500;

  beforeAll(async () => {
    app = await criarAppDeTeste();
    prisma = new PrismaClient();
    await prisma.$connect();
    await limparPlantoesDoSetor(prisma, SETOR_ID);
  });

  afterAll(async () => {
    await limparPlantoesDoSetor(prisma, SETOR_ID);
    await prisma.janelaDisponibilidade.deleteMany({
      where: { medico: { usuario: { email: { in: [TITULAR, SUBSTITUTO, TERCEIRO] } } } },
    });
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

  async function idDoMedico(email: string): Promise<string> {
    const u = await prisma.usuario.findUnique({
      where: { email },
      include: { medico: { select: { id: true } } },
    });
    return u?.medico?.id ?? '';
  }

  async function plantaoDoTitular(): Promise<{ plantaoId: string; inicio: Date; fim: Date }> {
    deslocamento += 2;
    const chefia = await entrar(CHEFIA);
    const inicio = new Date(Date.now() + deslocamento * 86_400_000);
    const fim = new Date(inicio.getTime() + 12 * 3_600_000);

    const vaga = await comSessao(http().post('/plantoes'), chefia)
      .send({
        setorId: SETOR_ID,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
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

    return { plantaoId, inicio, fim };
  }

  async function abrir(plantaoId: string, indicados: string[]): Promise<Repasse> {
    const titular = await entrar(TITULAR);
    const r = await comSessao(http().post(`/plantoes/${plantaoId}/repasses`), titular)
      .send({ motivo: 'Teste da fila de convites do repasse', indicados })
      .expect(201);
    return r.body as Repasse;
  }

  // ---------------------------------------------------------------------------

  describe('Forma 1 — indicação em fila (DEC-089)', () => {
    it('convida um de cada vez, na ordem; o segundo NÃO aceita antes da vez', async () => {
      const subId = await idDoMedico(SUBSTITUTO);
      const terId = await idDoMedico(TERCEIRO);
      const { plantaoId } = await plantaoDoTitular();

      const repasse = await abrir(plantaoId, [subId, terId]);
      expect(repasse.convidadoDaVez?.id).toBe(subId);
      expect(repasse.origemConvite).toBe('INDICACAO');

      // Furar a fila é exatamente a disputa por velocidade que a DEC-089 evita.
      const terceiro = await entrar(TERCEIRO);
      const r = await comSessao(http().post(`/repasses/${repasse.id}/aceitar`), terceiro)
        .send({})
        .expect(409);
      expect((r.body as { codigo: string }).codigo).toBe('NAO_EH_CONVIDADO_DA_VEZ');

      // O primeiro recusa → a vez passa ao segundo.
      const sub = await entrar(SUBSTITUTO);
      const depois = await comSessao(http().post(`/repasses/${repasse.id}/recusar-convite`), sub)
        .send({})
        .expect(200);
      expect((depois.body as Repasse).convidadoDaVez?.id).toBe(terId);

      const aceito = await comSessao(http().post(`/repasses/${repasse.id}/aceitar`), terceiro)
        .send({})
        .expect(200);
      expect((aceito.body as Repasse).status).toBe('AGUARDANDO_APROVACAO');
    });

    it('o prazo do convite segue o configurado na instituição (DEC-090)', async () => {
      const { plantaoId } = await plantaoDoTitular();
      const antes = Date.now();
      const repasse = await abrir(plantaoId, [await idDoMedico(SUBSTITUTO)]);

      const prazo = Date.parse(repasse.prazoConviteAte ?? '');
      // Padrão: 60 minutos.
      expect(prazo - antes).toBeGreaterThan(59 * 60_000);
      expect(prazo - antes).toBeLessThan(61 * 60_000);
    });

    it('recusa indicar a si mesmo', async () => {
      const { plantaoId } = await plantaoDoTitular();
      const titular = await entrar(TITULAR);

      const r = await comSessao(http().post(`/plantoes/${plantaoId}/repasses`), titular)
        .send({
          motivo: 'Tentando se indicar como substituto',
          indicados: [await idDoMedico(TITULAR)],
        })
        .expect(422);
      expect((r.body as { codigo: string }).codigo).toBe('INDICACAO_INVALIDA');
    });

    it('recusa mais de 5 indicados', async () => {
      const { plantaoId } = await plantaoDoTitular();
      const titular = await entrar(TITULAR);
      const seis = Array.from(
        { length: 6 },
        (_, i) => `00000000-0000-4000-8000-00000000000${String(i)}`,
      );

      await comSessao(http().post(`/plantoes/${plantaoId}/repasses`), titular)
        .send({ motivo: 'Indicando gente demais para a fila', indicados: seis })
        .expect(400);
    });
  });

  describe('Postgres decide, Redis acelera (DEC-097)', () => {
    it('com o job perdido, a próxima leitura vence o convite e a fila anda', async () => {
      const subId = await idDoMedico(SUBSTITUTO);
      const terId = await idDoMedico(TERCEIRO);
      const { plantaoId } = await plantaoDoTitular();
      const repasse = await abrir(plantaoId, [subId, terId]);

      // Simula o pior caso: o prazo passou e o Redis nunca avisou.
      await prisma.convite.updateMany({
        where: { repasseId: repasse.id, status: 'ATIVO' },
        data: { prazoAte: new Date(Date.now() - 60_000) },
      });

      // Basta o próximo da fila abrir a tela de Decisões.
      const terceiro = await entrar(TERCEIRO);
      const decisoes = (
        await http().get('/decisoes?modo=medico').set('Cookie', terceiro.cookies).expect(200)
      ).body as Array<{ tipo: string; repasse: { id: string } }>;

      expect(
        decisoes.some((d) => d.repasse.id === repasse.id && d.tipo === 'ACEITAR_CONVITE'),
      ).toBe(true);

      const chefia = await entrar(CHEFIA);
      const trilha = (
        await http()
          .get(`/plantoes/${plantaoId}/auditoria`)
          .set('Cookie', chefia.cookies)
          .expect(200)
      ).body as Array<{ acao: string }>;
      expect(trilha.map((e) => e.acao)).toContain('CONVITE_EXPIRADO');
    });

    it('agenda no Redis o vencimento do convite da vez', async () => {
      const { plantaoId } = await plantaoDoTitular();
      const repasse = await abrir(plantaoId, [await idDoMedico(SUBSTITUTO)]);

      const convite = await prisma.convite.findFirstOrThrow({
        where: { repasseId: repasse.id, status: 'ATIVO' },
      });

      const url = new URL(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379');
      const fila = new Queue('convites', {
        connection: { host: url.hostname, port: Number(url.port || 6379) },
      });

      try {
        // O agendamento é disparado sem esperar o Redis; dá um instante a ele.
        let job = await fila.getJob(`convite-${convite.id}`);
        for (let i = 0; i < 20 && job === undefined; i++) {
          await new Promise((r) => setTimeout(r, 100));
          job = await fila.getJob(`convite-${convite.id}`);
        }

        expect(job?.data).toEqual({ repasseId: repasse.id });
        // ~1h de atraso (padrão da instituição), com folga para o tempo do teste.
        expect(job?.opts.delay ?? 0).toBeGreaterThan(59 * 60_000);
      } finally {
        await fila.close();
      }
    });
  });

  describe('Forma 2 — matching quando a fila esgota (DEC-093, DEC-094)', () => {
    it('convida quem se ofereceu, marcado como MATCHING', async () => {
      const subId = await idDoMedico(SUBSTITUTO);
      const terId = await idDoMedico(TERCEIRO);
      const { plantaoId, inicio, fim } = await plantaoDoTitular();

      // O Terceiro se oferece para o horário.
      await prisma.janelaDisponibilidade.create({
        data: {
          medicoId: terId,
          inicio: new Date(inicio.getTime() - 3_600_000),
          fim: new Date(fim.getTime() + 3_600_000),
        },
      });

      try {
        const repasse = await abrir(plantaoId, [subId]);

        const sub = await entrar(SUBSTITUTO);
        const depois = (
          await comSessao(http().post(`/repasses/${repasse.id}/recusar-convite`), sub)
            .send({})
            .expect(200)
        ).body as Repasse;

        expect(depois.convidadoDaVez?.id).toBe(terId);
        expect(depois.origemConvite).toBe('MATCHING');
      } finally {
        await prisma.janelaDisponibilidade.deleteMany({ where: { medicoId: terId } });
      }
    });

    it('sem candidatos, a fila volta ao titular, que indica mais gente (DEC-096)', async () => {
      const { plantaoId } = await plantaoDoTitular();
      const repasse = await abrir(plantaoId, [await idDoMedico(SUBSTITUTO)]);

      const sub = await entrar(SUBSTITUTO);
      const esgotado = (
        await comSessao(http().post(`/repasses/${repasse.id}/recusar-convite`), sub)
          .send({})
          .expect(200)
      ).body as Repasse;

      expect(esgotado.status).toBe('SOLICITADO');
      expect(esgotado.filaEsgotada).toBe(true);
      expect(esgotado.convidadoDaVez).toBeNull();

      // O titular aponta outro colega — por CRM, sem disponibilidade declarada
      // (DEC-092).
      const titular = await entrar(TITULAR);
      const busca = await http()
        .get('/medicos/busca?crm=70003&uf=PE')
        .set('Cookie', titular.cookies)
        .expect(200);
      const terceiroId = (busca.body as { id: string }).id;

      const retomado = (
        await comSessao(http().post(`/repasses/${repasse.id}/indicar`), titular)
          .send({ indicados: [terceiroId] })
          .expect(200)
      ).body as Repasse;

      expect(retomado.filaEsgotada).toBe(false);
      expect(retomado.convidadoDaVez?.id).toBe(terceiroId);
    });
  });

  describe('fim do repasse', () => {
    it('o titular cancela e o plantão volta a ser só dele', async () => {
      const { plantaoId } = await plantaoDoTitular();
      const repasse = await abrir(plantaoId, [await idDoMedico(SUBSTITUTO)]);
      const titular = await entrar(TITULAR);

      const r = await comSessao(http().post(`/repasses/${repasse.id}/cancelar`), titular)
        .send({})
        .expect(200);
      expect((r.body as Repasse).status).toBe('CANCELADO');

      const plantao = await prisma.plantao.findUniqueOrThrow({ where: { id: plantaoId } });
      expect(plantao.status).toBe('CONFIRMADO');
      expect(plantao.medicoExecutanteId).toBe(await idDoMedico(TITULAR));
    });

    it('quando o plantão começa, o repasse em aberto é cancelado e o titular segue executante', async () => {
      const { plantaoId } = await plantaoDoTitular();
      const repasse = await abrir(plantaoId, [await idDoMedico(SUBSTITUTO)]);

      // Leva o plantão para o passado — o caso de a fila não ter achado ninguém
      // a tempo.
      const passado = new Date(Date.now() - 400 * 86_400_000);
      await prisma.plantao.update({
        where: { id: plantaoId },
        data: { inicio: passado, fim: new Date(passado.getTime() + 12 * 3_600_000) },
      });

      const titular = await entrar(TITULAR);
      const r = await http()
        .get(`/repasses/${repasse.id}`)
        .set('Cookie', titular.cookies)
        .expect(200);
      expect((r.body as Repasse).status).toBe('CANCELADO');

      const plantao = await prisma.plantao.findUniqueOrThrow({ where: { id: plantaoId } });
      expect(plantao.medicoExecutanteId).toBe(await idDoMedico(TITULAR));
    });
  });

  describe('quem vê o quê', () => {
    it('a fila inteira é do titular e da chefia — não dos outros convidados', async () => {
      const subId = await idDoMedico(SUBSTITUTO);
      const terId = await idDoMedico(TERCEIRO);
      const { plantaoId } = await plantaoDoTitular();
      const repasse = await abrir(plantaoId, [subId, terId]);

      const titular = await entrar(TITULAR);
      const fila = (
        await http().get(`/repasses/${repasse.id}/fila`).set('Cookie', titular.cookies).expect(200)
      ).body as Array<{ ordem: number; medico: { id: string }; status: string }>;
      expect(fila.map((c) => [c.ordem, c.medico.id, c.status])).toEqual([
        [1, subId, 'ATIVO'],
        [2, terId, 'NA_FILA'],
      ]);

      const chefia = await entrar(CHEFIA);
      await http().get(`/repasses/${repasse.id}/fila`).set('Cookie', chefia.cookies).expect(200);

      // O convidado não vê quem mais foi chamado.
      const sub = await entrar(SUBSTITUTO);
      await http().get(`/repasses/${repasse.id}/fila`).set('Cookie', sub.cookies).expect(404);
    });

    it('a busca por CRM só acha médico verificado (DEC-091)', async () => {
      const titular = await entrar(TITULAR);

      const achado = await http()
        .get('/medicos/busca?crm=70003&uf=PE')
        .set('Cookie', titular.cookies)
        .expect(200);
      expect((achado.body as { nome: string }).nome).toBe('Terceiro de Teste');

      // A Carla existe, mas não foi verificada — e a resposta não diz isso.
      const r = await http()
        .get('/medicos/busca?crm=99999&uf=PE')
        .set('Cookie', titular.cookies)
        .expect(404);
      expect((r.body as { codigo: string }).codigo).toBe('MEDICO_NAO_ENCONTRADO_POR_CRM');
    });

    it('o titular vê quem se ofereceu para o próprio plantão, sem ele mesmo', async () => {
      const terId = await idDoMedico(TERCEIRO);
      const { plantaoId, inicio, fim } = await plantaoDoTitular();
      await prisma.janelaDisponibilidade.create({
        data: {
          medicoId: terId,
          inicio: new Date(inicio.getTime() - 60_000),
          fim: new Date(fim.getTime() + 60_000),
        },
      });

      try {
        const titular = await entrar(TITULAR);
        const r = await http()
          .get(`/plantoes/${plantaoId}/substitutos`)
          .set('Cookie', titular.cookies)
          .expect(200);
        const ids = (r.body as Array<{ id: string }>).map((c) => c.id);

        expect(ids).toContain(terId);
        expect(ids).not.toContain(await idDoMedico(TITULAR));
      } finally {
        await prisma.janelaDisponibilidade.deleteMany({ where: { medicoId: terId } });
      }
    });
  });
});
