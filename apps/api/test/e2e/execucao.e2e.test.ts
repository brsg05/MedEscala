import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, type StatusPlantao } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_CSRF_TOKEN, HEADER_CSRF_TOKEN } from '@medescala/contracts';
import { ExecucaoService } from '../../src/modules/execucao/execucao.service';
import { criarAppDeTeste, cookiesDe, limparPlantoesDoSetor, valorDoCookie } from './app-de-teste';

const ORIGEM = 'http://localhost:5173';
const SENHA = process.env['SEED_SENHA_PADRAO'] ?? 'medescala123';
const SETOR_ID = '22222222-2222-4222-8222-222222222222';

const TITULAR = 'titular.e2e@medescala.test';
const SUBSTITUTO = 'substituto.e2e@medescala.test';
const TERCEIRO = 'terceiro.e2e@medescala.test';
const CHEFIA = 'chefia@medescala.test';
/** Chefia de OUTRA instituição (a clínica pendente do seed). */
const OUTRA_CHEFIA = 'clinica@medescala.test';

const HORA = 3_600_000;
const MIN = 60_000;

interface Sessao {
  cookies: string[];
  csrf: string;
}

interface Plantao {
  id: string;
  status: string;
  execucao: {
    checkinEm: string | null;
    checkoutEm: string | null;
    contestavelAte: string | null;
    semConfirmacao: boolean;
    contestacao: {
      justificativa: string;
      resposta: string | null;
      resultado: string | null;
    } | null;
  };
}

/**
 * F16 — confirmação de execução (DEC-130 a DEC-134).
 *
 * Os plantões precisam estar PERTO DE AGORA (a janela de check-in é de 30 min
 * antes do início), então são criados direto no banco, já com executante — como
 * o seed faz; o trigger da RN01 só age em UPDATE. Cada teste apaga os seus, para
 * os horários de um não esbarrarem na RN03 do seguinte.
 */
describe('execução do plantão (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await criarAppDeTeste();
    prisma = new PrismaClient();
    await prisma.$connect();
    await limparPlantoesDoSetor(prisma, SETOR_ID);
  });

  afterEach(async () => {
    await limparPlantoesDoSetor(prisma, SETOR_ID);
  });

  afterAll(async () => {
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
    const u = await prisma.usuario.findUniqueOrThrow({
      where: { email },
      include: { medico: { select: { id: true } } },
    });
    return u.medico?.id ?? '';
  }

  /** Plantão no setor de teste, `inicioEmMin` minutos a partir de agora. */
  async function plantao(
    email: string,
    inicioEmMin: number,
    horas: number,
    status: StatusPlantao = 'CONFIRMADO',
    extra: Partial<{ checkinEm: Date; checkoutEm: Date; contestavelAte: Date }> = {},
  ): Promise<string> {
    const inicio = new Date(Date.now() + inicioEmMin * MIN);
    const competencia = `${String(inicio.getUTCFullYear())}-${String(inicio.getUTCMonth() + 1).padStart(2, '0')}`;
    const escala = await prisma.escala.upsert({
      where: { setorId_competencia: { setorId: SETOR_ID, competencia } },
      update: {},
      create: { setorId: SETOR_ID, competencia },
    });
    const medicoId = await idDoMedico(email);

    const p = await prisma.plantao.create({
      data: {
        escalaId: escala.id,
        inicio,
        fim: new Date(inicio.getTime() + horas * HORA),
        valorCentavos: 120_000,
        especialidadeExigida: 'Clínica Médica',
        requisitos: [],
        modeloContratacao: 'PJ',
        medicoTitularId: medicoId,
        medicoExecutanteId: medicoId,
        status,
        ...extra,
      },
    });
    return p.id;
  }

  async function avisos(entidadeId: string, email: string): Promise<string[]> {
    const ns = await prisma.notificacao.findMany({
      where: { entidadeId, usuario: { email } },
      orderBy: { criadaEm: 'asc' },
    });
    return ns.map((n) => n.tipo);
  }

  const codigo = (r: { body: unknown }): string => (r.body as { codigo: string }).codigo;

  // ---------------------------------------------------------------------------

  describe('check-in e check-out (DEC-130, DEC-133)', () => {
    it('check-in fora da janela é recusado', async () => {
      const id = await plantao(TITULAR, 45, 12);
      const titular = await entrar(TITULAR);

      const r = await comSessao(http().post(`/plantoes/${id}/execucao/inicio`), titular)
        .send({})
        .expect(409);
      expect(codigo(r)).toBe('FORA_DA_JANELA_DE_EXECUCAO');
    });

    it('o executante faz check-in e check-out; a instituição é avisada com o prazo', async () => {
      const id = await plantao(TITULAR, -60, 12);
      const titular = await entrar(TITULAR);

      const dentro = await comSessao(http().post(`/plantoes/${id}/execucao/inicio`), titular)
        .send({})
        .expect(201);
      expect((dentro.body as Plantao).status).toBe('EM_EXECUCAO');

      const fora = await comSessao(http().post(`/plantoes/${id}/execucao/fim`), titular)
        .send({})
        .expect(201);
      const p = fora.body as Plantao;
      expect(p.status).toBe('EXECUTADO');

      // DEC-132: 72h de prazo padrão, contadas do check-out.
      const prazo = new Date(p.execucao.contestavelAte ?? 0).getTime();
      const checkout = new Date(p.execucao.checkoutEm ?? 0).getTime();
      expect(prazo - checkout).toBe(72 * HORA);

      expect(await avisos(id, CHEFIA)).toEqual(['CHECKOUT_REGISTRADO']);
    });

    it('só o executante: para outro médico, o plantão não existe (ADR-026)', async () => {
      const id = await plantao(TITULAR, -60, 12);
      const outro = await entrar(SUBSTITUTO);

      await comSessao(http().post(`/plantoes/${id}/execucao/inicio`), outro)
        .send({})
        .expect(404);
    });

    it('check-out sem check-in é transição inválida', async () => {
      const id = await plantao(TITULAR, -60, 12);
      const titular = await entrar(TITULAR);

      const r = await comSessao(http().post(`/plantoes/${id}/execucao/fim`), titular)
        .send({})
        .expect(409);
      expect(codigo(r)).toBe('TRANSICAO_INVALIDA');
    });
  });

  describe('check-in e repasse (DEC-104)', () => {
    async function comRepasseSolicitado(inicioEmMin: number): Promise<string> {
      const id = await plantao(TERCEIRO, inicioEmMin, 6, 'EM_REPASSE');
      await prisma.repasse.create({
        data: {
          plantaoId: id,
          medicoTitularId: await idDoMedico(TERCEIRO),
          motivo: 'Repasse que ninguém aceitou a tempo',
        },
      });
      return id;
    }

    it('antes do início, repasse em curso impede o check-in', async () => {
      const id = await comRepasseSolicitado(20);
      const terceiro = await entrar(TERCEIRO);

      const r = await comSessao(http().post(`/plantoes/${id}/execucao/inicio`), terceiro)
        .send({})
        .expect(409);
      expect(codigo(r)).toBe('REPASSE_EM_ANDAMENTO');
    });

    it('depois do início, o repasse vencido é encerrado e o check-in passa', async () => {
      const id = await comRepasseSolicitado(-10);
      const terceiro = await entrar(TERCEIRO);

      await comSessao(http().post(`/plantoes/${id}/execucao/inicio`), terceiro)
        .send({})
        .expect(201);

      const repasse = await prisma.repasse.findFirstOrThrow({ where: { plantaoId: id } });
      expect(repasse.status).toBe('CANCELADO');
    });
  });

  describe('contestação (DEC-134, ADR-020)', () => {
    async function executadoAgora(): Promise<string> {
      const agora = new Date();
      return plantao(TITULAR, -13 * 60, 12, 'EXECUTADO', {
        checkinEm: new Date(agora.getTime() - 13 * HORA),
        checkoutEm: new Date(agora.getTime() - HORA),
        contestavelAte: new Date(agora.getTime() + 71 * HORA),
      });
    }

    it('contesta, o médico responde uma vez, e a instituição mantém como cumprido', async () => {
      const id = await executadoAgora();
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);

      const contestado = await comSessao(http().post(`/plantoes/${id}/contestacao`), chefia)
        .send({ justificativa: 'Saída registrada na portaria às 15h, antes do fim' })
        .expect(201);
      expect((contestado.body as Plantao).status).toBe('CONTESTADO');
      expect(await avisos(id, TITULAR)).toEqual(['PLANTAO_CONTESTADO']);

      await comSessao(http().post(`/plantoes/${id}/contestacao/resposta`), titular)
        .send({ resposta: 'Saí para buscar um paciente na regulação e voltei' })
        .expect(201);
      expect(await avisos(id, CHEFIA)).toEqual(['CONTESTACAO_RESPONDIDA']);

      const segunda = await comSessao(http().post(`/plantoes/${id}/contestacao/resposta`), titular)
        .send({ resposta: 'Tentando reescrever a minha versão' })
        .expect(409);
      expect(codigo(segunda)).toBe('CONTESTACAO_JA_RESPONDIDA');

      const resolvido = await comSessao(
        http().post(`/plantoes/${id}/contestacao/resolucao`),
        chefia,
      )
        .send({ resultado: 'IMPROCEDENTE', nota: 'Regulação confirmou a saída do médico' })
        .expect(201);
      const p = resolvido.body as Plantao;
      expect(p.status).toBe('EXECUTADO');
      expect(p.execucao.contestacao?.resultado).toBe('IMPROCEDENTE');
      expect(p.execucao.contestavelAte).toBeNull();
      expect(await avisos(id, TITULAR)).toEqual(['PLANTAO_CONTESTADO', 'CONTESTACAO_RESOLVIDA']);
    });

    it('contestação procedente cancela o plantão', async () => {
      const id = await executadoAgora();
      const chefia = await entrar(CHEFIA);

      await comSessao(http().post(`/plantoes/${id}/contestacao`), chefia)
        .send({ justificativa: 'O médico não compareceu ao plantão' })
        .expect(201);
      const r = await comSessao(http().post(`/plantoes/${id}/contestacao/resolucao`), chefia)
        .send({ resultado: 'PROCEDENTE', nota: 'Ausência confirmada pela escala de enfermagem' })
        .expect(201);
      expect((r.body as Plantao).status).toBe('CANCELADO');
    });

    it('depois do prazo, não se contesta mais', async () => {
      const agora = new Date();
      const id = await plantao(TITULAR, -100 * 60, 12, 'EXECUTADO', {
        checkinEm: new Date(agora.getTime() - 100 * HORA),
        checkoutEm: new Date(agora.getTime() - 88 * HORA),
        contestavelAte: new Date(agora.getTime() - 16 * HORA),
      });
      const chefia = await entrar(CHEFIA);

      const r = await comSessao(http().post(`/plantoes/${id}/contestacao`), chefia)
        .send({ justificativa: 'Tentativa de contestar fora do prazo' })
        .expect(409);
      expect(codigo(r)).toBe('PRAZO_DE_CONTESTACAO_ENCERRADO');
    });

    it('contestação sem justificativa é recusada pelo schema', async () => {
      const id = await executadoAgora();
      const chefia = await entrar(CHEFIA);

      await comSessao(http().post(`/plantoes/${id}/contestacao`), chefia)
        .send({ justificativa: 'curta' })
        .expect(400);
    });

    it('chefia de outra instituição não contesta; médico também não', async () => {
      const id = await executadoAgora();

      const outra = await entrar(OUTRA_CHEFIA);
      const r = await comSessao(http().post(`/plantoes/${id}/contestacao`), outra)
        .send({ justificativa: 'Chefia de outra instituição tentando' })
        .expect(403);
      expect(codigo(r)).toBe('FORA_DO_ESCOPO_DA_INSTITUICAO');

      const medico = await entrar(SUBSTITUTO);
      await comSessao(http().post(`/plantoes/${id}/contestacao`), medico)
        .send({ justificativa: 'Médico tentando contestar plantão alheio' })
        .expect(403);
    });
  });

  describe('sem confirmação (DEC-131)', () => {
    it('aparece como sem confirmação; o médico já não faz check-in; a instituição confirma', async () => {
      const id = await plantao(TITULAR, -30 * 60, 12);
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);

      const lido = await http().get(`/plantoes/${id}`).set('Cookie', chefia.cookies).expect(200);
      expect((lido.body as Plantao).execucao.semConfirmacao).toBe(true);

      await comSessao(http().post(`/plantoes/${id}/execucao/inicio`), titular)
        .send({})
        .expect(409);

      const r = await comSessao(http().post(`/plantoes/${id}/execucao/confirmar`), chefia)
        .send({})
        .expect(201);
      const p = r.body as Plantao;
      expect(p.status).toBe('EXECUTADO');
      // Confirmado pela própria instituição: sem janela de contestação.
      expect(p.execucao.contestavelAte).toBeNull();
      expect(await avisos(id, TITULAR)).toEqual(['PLANTAO_CONFIRMADO']);
    });

    it('a instituição não confirma plantão que ainda não terminou', async () => {
      const id = await plantao(TITULAR, -60, 12);
      const chefia = await entrar(CHEFIA);

      await comSessao(http().post(`/plantoes/${id}/execucao/confirmar`), chefia)
        .send({})
        .expect(409);
    });
  });

  describe('lembretes agendados (F22)', () => {
    it('check-in liberado e sem confirmação saem uma vez só', async () => {
      const proximo = await plantao(SUBSTITUTO, 20, 6);
      const terminado = await plantao(TITULAR, -40 * 60, 12);
      const execucao = app.get(ExecucaoService);

      // Duas varreduras seguidas — e o job recorrente pode ter rodado também.
      await execucao.varrerLembretes();
      await execucao.varrerLembretes();

      expect(await avisos(proximo, SUBSTITUTO)).toEqual(['CHECKIN_LIBERADO']);
      expect(await avisos(terminado, CHEFIA)).toEqual(['PLANTAO_SEM_CONFIRMACAO']);
    });
  });
});
