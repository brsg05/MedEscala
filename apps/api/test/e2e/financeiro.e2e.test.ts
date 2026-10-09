import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_CSRF_TOKEN, HEADER_CSRF_TOKEN } from '@medescala/contracts';
import { FinanceiroService } from '../../src/modules/financeiro/financeiro.service';
import { criarAppDeTeste, cookiesDe, limparPlantoesDoSetor, valorDoCookie } from './app-de-teste';

const ORIGEM = 'http://localhost:5173';
const SENHA = process.env['SEED_SENHA_PADRAO'] ?? 'medescala123';
const SETOR_ID = '22222222-2222-4222-8222-222222222222';
const HOSPITAL_CNPJ = '12345678000190';

const TITULAR = 'titular.e2e@medescala.test';
const SUBSTITUTO = 'substituto.e2e@medescala.test';
const TERCEIRO = 'terceiro.e2e@medescala.test';
const CHEFIA = 'chefia@medescala.test';

const HORA = 3_600_000;

interface Sessao {
  cookies: string[];
  csrf: string;
}

interface Perna {
  id: string;
  perna: string;
  status: string;
  beneficiario: string;
  valorBrutoCentavos: number;
  retidoCentavos: number;
  liquidoCentavos: number;
  documentoFiscal: {
    id: string;
    status: string;
    emitidaPor: string | null;
    numero: string | null;
    retencoes: Array<{ tributo: string; valorCentavos: number; retido: boolean }>;
    podeEmitir: boolean;
  } | null;
}

/**
 * F14, F15, F17 — garantia, split e NFS-e simulados (DEC-201 a DEC-207).
 * Plantões a mais de 1800 dias, menos os que precisam estar acontecendo agora.
 */
describe('pagamento e nota fiscal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let deslocamento = 1800;
  let passados = 0;

  beforeAll(async () => {
    app = await criarAppDeTeste();
    prisma = new PrismaClient();
    await prisma.$connect();
    await limparPlantoesDoSetor(prisma, SETOR_ID);
  });

  afterEach(async () => {
    // Cada teste deixa o hospital como o seed deixou (modelo B habilitado).
    await prisma.instituicao.update({
      where: { cnpj: HOSPITAL_CNPJ },
      data: { permiteSubcontratacao: true, issRetidoBp: null },
    });
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
    const u = await prisma.usuario.findUniqueOrThrow({
      where: { email },
      include: { medico: { select: { id: true } } },
    });
    return u.medico?.id ?? '';
  }

  /** Vaga escalada para o titular pela API — a reserva nasce no fluxo real. */
  async function escalado(): Promise<string> {
    deslocamento += 2;
    const chefia = await entrar(CHEFIA);
    const inicio = new Date(Date.now() + deslocamento * 86_400_000);
    const vaga = await comSessao(http().post('/plantoes'), chefia)
      .send({
        setorId: SETOR_ID,
        inicio: inicio.toISOString(),
        fim: new Date(inicio.getTime() + 12 * HORA).toISOString(),
        valorCentavos: 140_000,
        especialidadeExigida: 'Clínica Médica',
        requisitos: [],
        modeloContratacao: 'PJ',
      })
      .expect(201);
    const id = (vaga.body as { id: string }).id;
    await comSessao(http().post(`/plantoes/${id}/atribuir`), chefia)
      .send({ medicoId: await idDoMedico(TITULAR) })
      .expect(201);
    return id;
  }

  /** Escalado, e então cumprido: as datas vão para o passado, check-in e check-out. */
  async function cumprido(): Promise<string> {
    const id = await escalado();
    const agora = Date.now();
    await prisma.plantao.update({
      where: { id },
      data: { inicio: new Date(agora - 13 * HORA), fim: new Date(agora + 11 * HORA) },
    });
    const titular = await entrar(TITULAR);
    await comSessao(http().post(`/plantoes/${id}/execucao/inicio`), titular)
      .send({})
      .expect(201);
    await comSessao(http().post(`/plantoes/${id}/execucao/fim`), titular)
      .send({})
      .expect(201);
    // Cumprido, o plantão vai para uma janela passada só dele: o próximo
    // "cumprido" do mesmo médico não pode sobrepor este (RN03, no banco).
    passados += 1;
    const inicio = new Date(agora - (passados + 1) * 24 * HORA);
    await prisma.plantao.update({
      where: { id },
      data: { inicio, fim: new Date(inicio.getTime() + 12 * HORA) },
    });
    return id;
  }

  async function financeiro(plantaoId: string, s: Sessao): Promise<Perna[]> {
    const r = await http()
      .get(`/plantoes/${plantaoId}/financeiro`)
      .set('Cookie', s.cookies)
      .expect(200);
    return (r.body as { pernas: Perna[] }).pernas;
  }

  async function vencerPrazo(plantaoId: string): Promise<void> {
    await prisma.pagamento.updateMany({
      where: { plantaoId, status: 'RETIDO' },
      data: { liberavelEm: new Date(Date.now() - 60_000) },
    });
    await app.get(FinanceiroService).varrerLiberacoes();
  }

  // ---------------------------------------------------------------------------

  it('escalar reserva o valor: garantia no aceite (DEC-201)', async () => {
    const id = await escalado();
    const chefia = await entrar(CHEFIA);

    const [perna] = await financeiro(id, chefia);
    expect(perna?.perna).toBe('PRINCIPAL');
    expect(perna?.status).toBe('PRE_AUTORIZADO');
    expect(perna?.valorBrutoCentavos).toBe(140_000);
  });

  it('cumprido: retém e prepara o rascunho; o médico emite com um toque; o prazo libera', async () => {
    const id = await cumprido();
    const titular = await entrar(TITULAR);

    const [retida] = await financeiro(id, titular);
    expect(retida?.status).toBe('RETIDO');
    // IRRF 1,5% (R$ 21,00) + PIS/COFINS/CSLL 4,65% (R$ 65,10) sobre R$ 1.400,00.
    expect(retida?.retidoCentavos).toBe(8_610);
    expect(retida?.liquidoCentavos).toBe(131_390);
    expect(retida?.documentoFiscal?.status).toBe('RASCUNHO');
    expect(retida?.documentoFiscal?.podeEmitir).toBe(true);

    const emitida = await comSessao(
      http().post(`/documentos-fiscais/${retida?.documentoFiscal?.id ?? ''}/emitir`),
      titular,
    )
      .send({})
      .expect(201);
    const doc = (emitida.body as { pernas: Perna[] }).pernas[0]?.documentoFiscal;
    expect(doc?.status).toBe('EMITIDA');
    expect(doc?.emitidaPor).toBe('MEDICO');
    expect(doc?.numero).toMatch(/^SIM-/u);

    await vencerPrazo(id);

    const [liberada] = await financeiro(id, titular);
    expect(liberada?.status).toBe('LIBERADO');
    expect((await prisma.plantao.findUniqueOrThrow({ where: { id } })).status).toBe('LIQUIDADO');
  });

  it('sem o toque, a plataforma emite no fim do prazo e libera (DEC-202)', async () => {
    const id = await cumprido();
    await vencerPrazo(id);

    const titular = await entrar(TITULAR);
    const [perna] = await financeiro(id, titular);
    expect(perna?.status).toBe('LIBERADO');
    expect(perna?.documentoFiscal?.emitidaPor).toBe('AUTOMATICA');

    const avisos = await prisma.notificacao.findMany({
      where: { entidadeId: id, usuario: { email: TITULAR } },
      select: { tipo: true },
    });
    expect(avisos.map((a) => a.tipo)).toEqual(
      expect.arrayContaining(['NFSE_PRONTA_PARA_EMITIR', 'NFSE_EMITIDA', 'PAGAMENTO_LIBERADO']),
    );
  });

  it('o banco recusa liberar sem nota emitida (F17)', async () => {
    const id = await cumprido();
    const pagamento = await prisma.pagamento.findFirstOrThrow({ where: { plantaoId: id } });

    await expect(
      prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { status: 'LIBERADO', liberadoEm: new Date() },
      }),
    ).rejects.toThrow(/sem NFS-e emitida/u);
  });

  it('contestação procedente: estorno integral e nota cancelada (DEC-191)', async () => {
    const id = await cumprido();
    const titular = await entrar(TITULAR);
    const chefia = await entrar(CHEFIA);

    const [antes] = await financeiro(id, titular);
    await comSessao(
      http().post(`/documentos-fiscais/${antes?.documentoFiscal?.id ?? ''}/emitir`),
      titular,
    )
      .send({})
      .expect(201);

    await comSessao(http().post(`/plantoes/${id}/contestacao`), chefia)
      .send({ justificativa: 'O médico não permaneceu no plantão' })
      .expect(201);
    await comSessao(http().post(`/plantoes/${id}/contestacao/resolucao`), chefia)
      .send({ resultado: 'PROCEDENTE', nota: 'Ausência confirmada pela enfermagem' })
      .expect(201);

    const [depois] = await financeiro(id, chefia);
    expect(depois?.status).toBe('ESTORNADO');
    expect(depois?.documentoFiscal?.status).toBe('CANCELADA');
  });

  it('com o plantão contestado, a nota não pode ser emitida', async () => {
    const id = await cumprido();
    const titular = await entrar(TITULAR);
    const chefia = await entrar(CHEFIA);
    const [perna] = await financeiro(id, titular);

    await comSessao(http().post(`/plantoes/${id}/contestacao`), chefia)
      .send({ justificativa: 'Horários não conferem com a portaria' })
      .expect(201);

    const r = await comSessao(
      http().post(`/documentos-fiscais/${perna?.documentoFiscal?.id ?? ''}/emitir`),
      titular,
    )
      .send({})
      .expect(409);
    expect((r.body as { codigo: string }).codigo).toBe('DOCUMENTO_FISCAL_NAO_EMISSIVEL');
  });

  async function repassar(id: string, modeloFiscal: string): Promise<void> {
    const titular = await entrar(TITULAR);
    const sub = await entrar(SUBSTITUTO);
    const chefia = await entrar(CHEFIA);
    const aberto = await comSessao(http().post(`/plantoes/${id}/repasses`), titular)
      .send({
        motivo: 'Teste do fluxo financeiro',
        modeloFiscal,
        indicados: [await idDoMedico(SUBSTITUTO)],
      })
      .expect(201);
    const repasseId = (aberto.body as { id: string }).id;
    await comSessao(http().post(`/repasses/${repasseId}/aceitar`), sub)
      .send({})
      .expect(200);
    await comSessao(http().post(`/repasses/${repasseId}/aprovar`), chefia)
      .send({})
      .expect(200);
  }

  it('modelo A: a reserva do titular cai, e a instituição reserva para o substituto', async () => {
    const id = await escalado();
    await repassar(id, 'A_RECONTRATACAO');

    const pernas = await prisma.pagamento.findMany({
      where: { plantaoId: id },
      orderBy: { preAutorizadoEm: 'asc' },
    });
    expect(pernas.map((p) => [p.perna, p.status])).toEqual([
      ['PRINCIPAL', 'CANCELADO'],
      ['PRINCIPAL', 'PRE_AUTORIZADO'],
    ]);
    expect(pernas[1]?.beneficiarioMedicoId).toBe(await idDoMedico(SUBSTITUTO));
  });

  it('modelo B: duas pernas; cada parte vê só as suas (DEC-203)', async () => {
    const id = await escalado();
    await repassar(id, 'B_SUBCONTRATACAO');

    const chefia = await entrar(CHEFIA);
    const titular = await entrar(TITULAR);
    const sub = await entrar(SUBSTITUTO);

    expect((await financeiro(id, chefia)).map((p) => p.perna)).toEqual(['PRINCIPAL']);
    expect((await financeiro(id, titular)).map((p) => p.perna).sort()).toEqual([
      'PRINCIPAL',
      'SUBCONTRATACAO',
    ]);
    const doSubstituto = await financeiro(id, sub);
    expect(doSubstituto.map((p) => p.perna)).toEqual(['SUBCONTRATACAO']);
    expect(doSubstituto[0]?.status).toBe('PRE_AUTORIZADO');
  });

  it('modelo B só onde a instituição habilitou (DEC-207)', async () => {
    const id = await escalado();
    await prisma.instituicao.update({
      where: { cnpj: HOSPITAL_CNPJ },
      data: { permiteSubcontratacao: false },
    });
    const titular = await entrar(TITULAR);

    const r = await comSessao(http().post(`/plantoes/${id}/repasses`), titular)
      .send({
        motivo: 'Tentativa de subcontratar',
        modeloFiscal: 'B_SUBCONTRATACAO',
        indicados: [await idDoMedico(SUBSTITUTO)],
      })
      .expect(422);
    expect((r.body as { codigo: string }).codigo).toBe('SUBCONTRATACAO_NAO_PERMITIDA');
  });

  it('ISS configurado pela instituição entra no rascunho (DEC-206)', async () => {
    await prisma.instituicao.update({
      where: { cnpj: HOSPITAL_CNPJ },
      data: { issRetidoBp: 500 },
    });
    const id = await cumprido();
    const titular = await entrar(TITULAR);

    const [perna] = await financeiro(id, titular);
    const iss = perna?.documentoFiscal?.retencoes.find((l) => l.tributo === 'ISS');
    expect(iss?.valorCentavos).toBe(7_000);
    expect(perna?.retidoCentavos).toBe(8_610 + 7_000);
  });

  it('quem não participa não vê o financeiro nem emite a nota', async () => {
    const id = await cumprido();
    const titular = await entrar(TITULAR);
    const [perna] = await financeiro(id, titular);

    const terceiro = await entrar(TERCEIRO);
    await http().get(`/plantoes/${id}/financeiro`).set('Cookie', terceiro.cookies).expect(404);
    await comSessao(
      http().post(`/documentos-fiscais/${perna?.documentoFiscal?.id ?? ''}/emitir`),
      terceiro,
    )
      .send({})
      .expect(404);
  });
});
