import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
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

/**
 * O núcleo do projeto — F07, F10, F11, F12, F23 — com a fila de convites
 * (DEC-087 a DEC-099).
 *
 * A Entrega 1 (§5.1) é categórica: a substituição só vale registrada na escala e
 * autorizada pela chefia, e até lá o titular permanece responsável. Este arquivo
 * percorre o fluxo triádico e TENTA violar a RN01 por vários caminhos — inclusive
 * por baixo da aplicação, com UPDATE direto no banco.
 *
 * Os plantões caem a mais de 100 dias: fora da janela de 14 dias em que o Bruno
 * (seed) se oferece, para o matching não convidá-lo no meio de um teste.
 */
describe('repasse de plantão (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let deslocamento = 100;

  beforeAll(async () => {
    app = await criarAppDeTeste();
    prisma = new PrismaClient();
    await prisma.$connect();
    // Só o setor de TESTE; o de demonstração sobrevive. Repasses e convites caem
    // junto, por cascata.
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

  async function idDoMedico(email: string): Promise<string> {
    const u = await prisma.usuario.findUnique({
      where: { email },
      include: { medico: { select: { id: true } } },
    });
    return u?.medico?.id ?? '';
  }

  /** Plantão confirmado do titular, num horário só dele (RN03). */
  async function plantaoConfirmado(chefia: Sessao, titularId: string) {
    deslocamento += 2;
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
      .send({ medicoId: titularId })
      .expect(201);

    return { plantaoId, inicio, fim };
  }

  async function abrir(titular: Sessao, plantaoId: string, indicados: string[]) {
    const r = await comSessao(http().post(`/plantoes/${plantaoId}/repasses`), titular)
      .send({ motivo: 'Convocação para junta médica no mesmo horário', indicados })
      .expect(201);
    return r.body as {
      id: string;
      status: string;
      convidadoDaVez: { id: string } | null;
      origemConvite: string | null;
    };
  }

  async function vaga(chefia: Sessao, dias: number): Promise<string> {
    const inicio = new Date(Date.now() + dias * 86_400_000);
    const r = await comSessao(http().post('/plantoes'), chefia)
      .send({
        setorId: SETOR_ID,
        inicio: inicio.toISOString(),
        fim: new Date(inicio.getTime() + 12 * 3_600_000).toISOString(),
        valorCentavos: 100_000,
        especialidadeExigida: 'Clínica Médica',
        requisitos: [],
        modeloContratacao: 'PJ',
      })
      .expect(201);
    return (r.body as { id: string }).id;
  }

  // ---------------------------------------------------------------------------

  describe('fluxo triádico completo', () => {
    it('vai de vaga publicada a executante trocado, passando pela chefia', async () => {
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);
      const substituto = await entrar(SUBSTITUTO);
      const titularId = await idDoMedico(TITULAR);
      const substitutoId = await idDoMedico(SUBSTITUTO);

      const { plantaoId } = await plantaoConfirmado(chefia, titularId);
      const repasse = await abrir(titular, plantaoId, [substitutoId]);

      expect(repasse.status).toBe('SOLICITADO');
      expect(repasse.convidadoDaVez?.id).toBe(substitutoId);

      // O executante continua sendo o titular — este é o ponto.
      expect(
        (await prisma.plantao.findUnique({ where: { id: plantaoId } }))?.medicoExecutanteId,
      ).toBe(titularId);

      const aceito = await comSessao(http().post(`/repasses/${repasse.id}/aceitar`), substituto)
        .send({})
        .expect(200);
      expect((aceito.body as { status: string }).status).toBe('AGUARDANDO_APROVACAO');
      expect(
        (await prisma.plantao.findUnique({ where: { id: plantaoId } }))?.medicoExecutanteId,
      ).toBe(titularId);

      const aprovado = await comSessao(http().post(`/repasses/${repasse.id}/aprovar`), chefia)
        .send({})
        .expect(200);
      expect((aprovado.body as { status: string }).status).toBe('APROVADO');

      const depois = await prisma.plantao.findUnique({ where: { id: plantaoId } });
      expect(depois?.medicoExecutanteId).toBe(substitutoId);
      expect(depois?.status).toBe('CONFIRMADO');
      expect(depois?.medicoTitularId).toBe(titularId);
    });

    it('F23 — a trilha devolve a sequência exata de eventos, convite incluído', async () => {
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);
      const substituto = await entrar(SUBSTITUTO);

      const { plantaoId } = await plantaoConfirmado(chefia, await idDoMedico(TITULAR));
      const repasse = await abrir(titular, plantaoId, [await idDoMedico(SUBSTITUTO)]);
      await comSessao(http().post(`/repasses/${repasse.id}/aceitar`), substituto)
        .send({})
        .expect(200);
      await comSessao(http().post(`/repasses/${repasse.id}/aprovar`), chefia)
        .send({})
        .expect(200);

      const trilha = await http()
        .get(`/plantoes/${plantaoId}/auditoria`)
        .set('Cookie', chefia.cookies)
        .expect(200);

      expect((trilha.body as Array<{ acao: string }>).map((e) => e.acao)).toEqual([
        'VAGA_PUBLICADA',
        'MEDICO_ESCALADO',
        'REPASSE_SOLICITADO',
        'PLANTAO_EM_REPASSE',
        'CONVITE_ENVIADO',
        'REPASSE_ACEITO_PELO_SUBSTITUTO',
        'REPASSE_ENVIADO_PARA_APROVACAO',
        'REPASSE_APROVADO',
        'EXECUTANTE_SUBSTITUIDO',
      ]);
    });
  });

  describe('RN01 — nenhum repasse se conclui sem aprovação da instituição', () => {
    it('recusa aprovar sem o aceite do substituto', async () => {
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);
      const { plantaoId } = await plantaoConfirmado(chefia, await idDoMedico(TITULAR));
      const repasse = await abrir(titular, plantaoId, [await idDoMedico(SUBSTITUTO)]);

      const r = await comSessao(http().post(`/repasses/${repasse.id}/aprovar`), chefia)
        .send({})
        .expect(409);
      expect((r.body as { codigo: string }).codigo).toBe('TRANSICAO_INVALIDA');
    });

    it('recusa o médico aprovando o próprio repasse — 403 por perfil', async () => {
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);
      const substituto = await entrar(SUBSTITUTO);
      const { plantaoId } = await plantaoConfirmado(chefia, await idDoMedico(TITULAR));
      const repasse = await abrir(titular, plantaoId, [await idDoMedico(SUBSTITUTO)]);
      await comSessao(http().post(`/repasses/${repasse.id}/aceitar`), substituto)
        .send({})
        .expect(200);

      // O arranjo informal que o produto existe para impedir.
      await comSessao(http().post(`/repasses/${repasse.id}/aprovar`), titular)
        .send({})
        .expect(403);
      await comSessao(http().post(`/repasses/${repasse.id}/aprovar`), substituto)
        .send({})
        .expect(403);
    });

    it('o BANCO recusa trocar o executante sem repasse aprovado', async () => {
      const chefia = await entrar(CHEFIA);
      const titularId = await idDoMedico(TITULAR);
      const { plantaoId } = await plantaoConfirmado(chefia, titularId);
      const outro = await idDoMedico(SUBSTITUTO);

      // UPDATE direto, por baixo de todos os serviços. O trigger de
      // `supabase/policies/002` é o que torna a RN01 garantia e não convenção.
      await expect(
        prisma.plantao.update({ where: { id: plantaoId }, data: { medicoExecutanteId: outro } }),
      ).rejects.toThrow(/RN01/u);

      expect(
        (await prisma.plantao.findUnique({ where: { id: plantaoId } }))?.medicoExecutanteId,
      ).toBe(titularId);
    });

    it('recusa da chefia mantém o titular responsável e RETOMA a fila (DEC-099)', async () => {
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);
      const substituto = await entrar(SUBSTITUTO);
      const titularId = await idDoMedico(TITULAR);
      const terceiroId = await idDoMedico(TERCEIRO);

      const { plantaoId } = await plantaoConfirmado(chefia, titularId);
      const repasse = await abrir(titular, plantaoId, [await idDoMedico(SUBSTITUTO), terceiroId]);
      await comSessao(http().post(`/repasses/${repasse.id}/aceitar`), substituto)
        .send({})
        .expect(200);

      const recusado = await comSessao(http().post(`/repasses/${repasse.id}/recusar`), chefia)
        .send({ justificativa: 'Substituto sem experiência na sala vermelha' })
        .expect(200);

      const corpo = recusado.body as {
        status: string;
        convidadoDaVez: { id: string } | null;
        justificativaRecusa: string;
      };
      // A chefia recusou o substituto, não o repasse: a fila segue com o próximo.
      expect(corpo.status).toBe('SOLICITADO');
      expect(corpo.convidadoDaVez?.id).toBe(terceiroId);
      expect(corpo.justificativaRecusa).toBe('Substituto sem experiência na sala vermelha');

      const plantao = await prisma.plantao.findUnique({ where: { id: plantaoId } });
      expect(plantao?.medicoExecutanteId).toBe(titularId);
      expect(plantao?.status).toBe('EM_REPASSE');
    });

    it('exige justificativa na recusa (F11)', async () => {
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);
      const substituto = await entrar(SUBSTITUTO);
      const { plantaoId } = await plantaoConfirmado(chefia, await idDoMedico(TITULAR));
      const repasse = await abrir(titular, plantaoId, [await idDoMedico(SUBSTITUTO)]);
      await comSessao(http().post(`/repasses/${repasse.id}/aceitar`), substituto)
        .send({})
        .expect(200);

      await comSessao(http().post(`/repasses/${repasse.id}/recusar`), chefia)
        .send({ justificativa: 'curta' })
        .expect(400);
    });
  });

  describe('RN02 — médico com CRM não verificado', () => {
    it('não entra na escala', async () => {
      const chefia = await entrar(CHEFIA);
      const vagaId = await vaga(chefia, 300);

      const r = await comSessao(http().post(`/plantoes/${vagaId}/atribuir`), chefia)
        .send({ medicoId: await idDoMedico('naoverificado@medescala.test') })
        .expect(422);
      expect((r.body as { codigo: string }).codigo).toBe('MEDICO_NAO_VERIFICADO');
    });

    it('não pode ser indicado como substituto', async () => {
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);
      const { plantaoId } = await plantaoConfirmado(chefia, await idDoMedico(TITULAR));

      const r = await comSessao(http().post(`/plantoes/${plantaoId}/repasses`), titular)
        .send({
          motivo: 'Indicando quem ainda não foi verificado',
          indicados: [await idDoMedico('naoverificado@medescala.test')],
        })
        .expect(422);
      expect((r.body as { codigo: string }).codigo).toBe('INDICACAO_INVALIDA');
    });
  });

  describe('RN03 — sobreposição de horários', () => {
    it('recusa escalar o mesmo médico em dois plantões que se sobrepõem', async () => {
      const chefia = await entrar(CHEFIA);
      const titularId = await idDoMedico(TITULAR);
      const { inicio } = await plantaoConfirmado(chefia, titularId);

      const sobreposto = new Date(inicio.getTime() + 6 * 3_600_000);
      const r1 = await comSessao(http().post('/plantoes'), chefia)
        .send({
          setorId: SETOR_ID,
          inicio: sobreposto.toISOString(),
          fim: new Date(sobreposto.getTime() + 12 * 3_600_000).toISOString(),
          valorCentavos: 100_000,
          especialidadeExigida: 'Clínica Médica',
          requisitos: [],
          modeloContratacao: 'PJ',
        })
        .expect(201);

      const r = await comSessao(
        http().post(`/plantoes/${(r1.body as { id: string }).id}/atribuir`),
        chefia,
      )
        .send({ medicoId: titularId })
        .expect(409);
      expect((r.body as { codigo: string }).codigo).toBe('SOBREPOSICAO_DE_AGENDA');
    });

    it('aceita plantões que apenas encostam', async () => {
      const chefia = await entrar(CHEFIA);
      const titularId = await idDoMedico(TITULAR);
      const { fim } = await plantaoConfirmado(chefia, titularId);

      const r1 = await comSessao(http().post('/plantoes'), chefia)
        .send({
          setorId: SETOR_ID,
          inicio: fim.toISOString(),
          fim: new Date(fim.getTime() + 12 * 3_600_000).toISOString(),
          valorCentavos: 100_000,
          especialidadeExigida: 'Clínica Médica',
          requisitos: [],
          modeloContratacao: 'PJ',
        })
        .expect(201);

      await comSessao(http().post(`/plantoes/${(r1.body as { id: string }).id}/atribuir`), chefia)
        .send({ medicoId: titularId })
        .expect(201);
    });
  });

  describe('F07 — antecedência mínima (RN08)', () => {
    it('recusa repasse pedido em cima da hora', async () => {
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);
      const titularId = await idDoMedico(TITULAR);

      const inicio = new Date(Date.now() + 6 * 3_600_000);
      const r1 = await comSessao(http().post('/plantoes'), chefia)
        .send({
          setorId: SETOR_ID,
          inicio: inicio.toISOString(),
          fim: new Date(inicio.getTime() + 12 * 3_600_000).toISOString(),
          valorCentavos: 100_000,
          especialidadeExigida: 'Clínica Médica',
          requisitos: [],
          modeloContratacao: 'PJ',
        })
        .expect(201);
      const plantaoId = (r1.body as { id: string }).id;
      await comSessao(http().post(`/plantoes/${plantaoId}/atribuir`), chefia)
        .send({ medicoId: titularId })
        .expect(201);

      const r = await comSessao(http().post(`/plantoes/${plantaoId}/repasses`), titular)
        .send({ motivo: 'Imprevisto de última hora que não respeita o prazo', indicados: [] })
        .expect(422);
      expect((r.body as { codigo: string }).codigo).toBe('ANTECEDENCIA_INSUFICIENTE');
    });
  });

  describe('listagens — o perfil decide o que aparece', () => {
    it('a chefia vê a substituição para aprovar; o médico NÃO', async () => {
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);
      const substituto = await entrar(SUBSTITUTO);
      const { plantaoId } = await plantaoConfirmado(chefia, await idDoMedico(TITULAR));
      const repasse = await abrir(titular, plantaoId, [await idDoMedico(SUBSTITUTO)]);
      await comSessao(http().post(`/repasses/${repasse.id}/aceitar`), substituto)
        .send({})
        .expect(200);

      const daChefia = (await http().get('/decisoes').set('Cookie', chefia.cookies).expect(200))
        .body as Array<{ tipo: string; repasse: { id: string } }>;
      expect(
        daChefia.some((d) => d.repasse.id === repasse.id && d.tipo === 'APROVAR_SUBSTITUICAO'),
      ).toBe(true);

      const doTitular = (await http().get('/decisoes').set('Cookie', titular.cookies).expect(200))
        .body as Array<{ tipo: string }>;
      expect(doTitular.some((d) => d.tipo === 'APROVAR_SUBSTITUICAO')).toBe(false);
    });

    it('o titular vê o próprio repasse, com o plantão junto', async () => {
      const chefia = await entrar(CHEFIA);
      const titular = await entrar(TITULAR);
      const { plantaoId } = await plantaoConfirmado(chefia, await idDoMedico(TITULAR));
      const repasse = await abrir(titular, plantaoId, [await idDoMedico(SUBSTITUTO)]);

      const lista = (
        await http().get('/repasses?modo=medico').set('Cookie', titular.cookies).expect(200)
      ).body as Array<{ repasse: { id: string }; plantao: { id: string } }>;
      expect(lista.find((i) => i.repasse.id === repasse.id)?.plantao.id).toBe(plantaoId);
    });
  });
});
