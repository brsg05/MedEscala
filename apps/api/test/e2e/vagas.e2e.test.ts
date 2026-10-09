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
const NAO_VERIFICADO = 'naoverificado@medescala.test';
const CHEFIA = 'chefia@medescala.test';

interface Sessao {
  cookies: string[];
  csrf: string;
}

interface Plantao {
  id: string;
  status: string;
  executante: { id: string } | null;
  selecao: { candidaturasPendentes: number; convidadoDaVez: { id: string } | null } | null;
}

interface Vaga {
  plantao: Plantao;
  compativel: boolean;
  motivo: string | null;
  minhaCandidatura: { id: string; status: string } | null;
}

/**
 * F10 — vaga aberta: convite pela fila e candidatura (DEC-135, DEC-164 a DEC-168).
 *
 * Vagas a mais de 1200 dias: longe da janela de disponibilidade do seed, para o
 * matching não achar ninguém de propósito — e longe das outras suítes.
 */
describe('vagas abertas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let deslocamento = 1200;

  beforeAll(async () => {
    app = await criarAppDeTeste();
    prisma = new PrismaClient();
    await prisma.$connect();
    await limparPlantoesDoSetor(prisma, SETOR_ID);
    // Candidaturas de execuções anteriores caem junto com os plantões (cascata).
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

  async function vaga(especialidade = 'Clínica Médica'): Promise<string> {
    deslocamento += 2;
    const chefia = await entrar(CHEFIA);
    const inicio = new Date(Date.now() + deslocamento * 86_400_000);
    const r = await comSessao(http().post('/plantoes'), chefia)
      .send({
        setorId: SETOR_ID,
        inicio: inicio.toISOString(),
        fim: new Date(inicio.getTime() + 12 * 3_600_000).toISOString(),
        valorCentavos: 130_000,
        especialidadeExigida: especialidade,
        requisitos: [],
        modeloContratacao: 'PJ',
      })
      .expect(201);
    return (r.body as { id: string }).id;
  }

  async function vagas(s: Sessao, todas = false): Promise<Vaga[]> {
    const r = await http()
      .get(`/vagas${todas ? '?todas=true' : ''}`)
      .set('Cookie', s.cookies)
      .expect(200);
    return r.body as Vaga[];
  }

  async function avisos(entidadeId: string, email: string): Promise<string[]> {
    const ns = await prisma.notificacao.findMany({
      where: { entidadeId, usuario: { email } },
      orderBy: { criadaEm: 'asc' },
    });
    return ns.map((n) => n.tipo);
  }

  async function statusDe(plantaoId: string): Promise<string> {
    return (await prisma.plantao.findUniqueOrThrow({ where: { id: plantaoId } })).status;
  }

  const codigo = (r: { body: unknown }): string => (r.body as { codigo: string }).codigo;

  // ---------------------------------------------------------------------------

  // Primeiro de propósito: aqui ninguém tem vínculo nem plantão cumprido ainda,
  // e a taxa de resposta é o que decide.
  describe('matching da vaga (DEC-136)', () => {
    it('quem deixou convite vencer desce, mesmo vindo antes no alfabeto', async () => {
      const id = await vaga();
      const historico = await vaga();
      const subId = await idDoMedico(SUBSTITUTO);
      const terId = await idDoMedico(TERCEIRO);
      const plantao = await prisma.plantao.findUniqueOrThrow({ where: { id } });

      // Os dois se ofereceram para o horário (DEC-062)...
      for (const medicoId of [subId, terId]) {
        await prisma.janelaDisponibilidade.create({
          data: { medicoId, inicio: plantao.inicio, fim: plantao.fim },
        });
      }
      // ...mas o Substituto deixou um convite recente vencer.
      await prisma.convite.create({
        data: {
          plantaoId: historico,
          medicoId: subId,
          ordem: 1,
          origem: 'MATCHING',
          status: 'EXPIRADO',
          ativadoEm: new Date(Date.now() - 86_400_000),
          prazoAte: new Date(Date.now() - 82_800_000),
        },
      });

      try {
        const chefia = await entrar(CHEFIA);
        await comSessao(http().post(`/plantoes/${id}/convites`), chefia)
          .send({ indicados: [] })
          .expect(201);

        const fila = await prisma.convite.findMany({
          where: { plantaoId: id },
          orderBy: { ordem: 'asc' },
          select: { medicoId: true, origem: true },
        });
        // Sem a taxa, "Substituto" viria antes de "Terceiro" pelo nome.
        expect(fila.map((c) => c.medicoId)).toEqual([terId, subId]);
        expect(fila.every((c) => c.origem === 'MATCHING')).toBe(true);
      } finally {
        await prisma.janelaDisponibilidade.deleteMany({
          where: { medicoId: { in: [subId, terId] } },
        });
      }
    });
  });

  describe('o que o médico vê (DEC-166, DEC-167)', () => {
    it('por padrão só as compatíveis; com "todas", as outras vêm com o motivo', async () => {
      const compativel = await vaga();
      const outraEspecialidade = await vaga('Pediatria');
      const sub = await entrar(SUBSTITUTO);

      const padrao = (await vagas(sub)).map((v) => v.plantao.id);
      expect(padrao).toContain(compativel);
      expect(padrao).not.toContain(outraEspecialidade);

      const todas = await vagas(sub, true);
      const pediatria = todas.find((v) => v.plantao.id === outraEspecialidade);
      expect(pediatria?.compativel).toBe(false);
      expect(pediatria?.motivo).toBe('Exige Pediatria');
      // O médico nunca vê como anda a seleção (DEC-108).
      expect(pediatria?.plantao.selecao).toBeNull();
    });

    it('vaga incompatível não aceita candidatura (RN02)', async () => {
      const id = await vaga('Pediatria');
      const sub = await entrar(SUBSTITUTO);

      const r = await comSessao(http().post(`/plantoes/${id}/candidaturas`), sub)
        .send({})
        .expect(422);
      expect(codigo(r)).toBe('REQUISITOS_NAO_ATENDIDOS');
    });

    it('médico com CRM não conferido não se candidata', async () => {
      const id = await vaga();
      const nv = await entrar(NAO_VERIFICADO);

      const r = await comSessao(http().post(`/plantoes/${id}/candidaturas`), nv)
        .send({})
        .expect(422);
      expect(codigo(r)).toBe('MEDICO_NAO_VERIFICADO');
    });
  });

  describe('candidatura (DEC-135)', () => {
    it('dois se candidatam, a chefia escolhe um, o outro é avisado', async () => {
      const id = await vaga();
      const sub = await entrar(SUBSTITUTO);
      const ter = await entrar(TERCEIRO);
      const chefia = await entrar(CHEFIA);

      const minha = await comSessao(http().post(`/plantoes/${id}/candidaturas`), sub)
        .send({})
        .expect(201);
      expect((minha.body as Vaga).minhaCandidatura?.status).toBe('PENDENTE');
      await comSessao(http().post(`/plantoes/${id}/candidaturas`), ter)
        .send({})
        .expect(201);

      expect(await avisos(id, CHEFIA)).toEqual(['CANDIDATURA_RECEBIDA', 'CANDIDATURA_RECEBIDA']);

      const lista = await http()
        .get(`/plantoes/${id}/candidaturas`)
        .set('Cookie', chefia.cookies)
        .expect(200);
      const candidaturas = lista.body as Array<{ id: string; medico: { id: string } }>;
      expect(candidaturas).toHaveLength(2);

      const terId = await idDoMedico(TERCEIRO);
      const escolhida = candidaturas.find((c) => c.medico.id === terId);
      const escalado = await comSessao(
        http().post(`/candidaturas/${escolhida?.id ?? ''}/aceitar`),
        chefia,
      )
        .send({})
        .expect(201);

      expect((escalado.body as Plantao).status).toBe('CONFIRMADO');
      expect((escalado.body as Plantao).executante?.id).toBe(terId);
      expect(await avisos(id, TERCEIRO)).toEqual(['CANDIDATURA_ACEITA']);
      expect(await avisos(id, SUBSTITUTO)).toEqual(['CANDIDATURA_ENCERRADA']);

      const status = await prisma.candidatura.findMany({
        where: { plantaoId: id },
        select: { medicoId: true, status: true },
      });
      expect(status.find((c) => c.medicoId === terId)?.status).toBe('ACEITA');
      expect(status.find((c) => c.medicoId !== terId)?.status).toBe('ENCERRADA');
    });

    it('retirar e voltar; recusada não volta', async () => {
      const id = await vaga();
      const sub = await entrar(SUBSTITUTO);
      const chefia = await entrar(CHEFIA);

      const r = await comSessao(http().post(`/plantoes/${id}/candidaturas`), sub)
        .send({})
        .expect(201);
      const candidaturaId = (r.body as Vaga).minhaCandidatura?.id ?? '';

      await comSessao(http().post(`/candidaturas/${candidaturaId}/retirar`), sub)
        .send({})
        .expect(204);
      const devolta = await comSessao(http().post(`/plantoes/${id}/candidaturas`), sub)
        .send({})
        .expect(201);
      expect((devolta.body as Vaga).minhaCandidatura?.status).toBe('PENDENTE');

      await comSessao(http().post(`/candidaturas/${candidaturaId}/recusar`), chefia)
        .send({})
        .expect(204);
      expect(await avisos(id, SUBSTITUTO)).toEqual(['CANDIDATURA_RECUSADA']);

      const insistiu = await comSessao(http().post(`/plantoes/${id}/candidaturas`), sub)
        .send({})
        .expect(409);
      expect(codigo(insistiu)).toBe('CANDIDATURA_JA_RESPONDIDA');
    });

    it('candidatura de outra pessoa responde como inexistente (ADR-026)', async () => {
      const id = await vaga();
      const sub = await entrar(SUBSTITUTO);
      const r = await comSessao(http().post(`/plantoes/${id}/candidaturas`), sub)
        .send({})
        .expect(201);

      const ter = await entrar(TERCEIRO);
      await comSessao(
        http().post(`/candidaturas/${(r.body as Vaga).minhaCandidatura?.id ?? ''}/retirar`),
        ter,
      )
        .send({})
        .expect(404);
    });
  });

  describe('convite pela fila (DEC-135, DEC-164)', () => {
    it('um por vez, na ordem; o aceite confirma direto e fecha as candidaturas', async () => {
      const id = await vaga();
      const subId = await idDoMedico(SUBSTITUTO);
      const terId = await idDoMedico(TERCEIRO);
      const chefia = await entrar(CHEFIA);
      const sub = await entrar(SUBSTITUTO);
      const ter = await entrar(TERCEIRO);
      const titular = await entrar(TITULAR);

      // Uma candidatura correndo em paralelo, que o aceite do convite encerra.
      await comSessao(http().post(`/plantoes/${id}/candidaturas`), titular)
        .send({})
        .expect(201);

      const convidou = await comSessao(http().post(`/plantoes/${id}/convites`), chefia)
        .send({ indicados: [subId, terId] })
        .expect(201);
      const p = convidou.body as Plantao;
      expect(p.status).toBe('EM_SELECAO');
      expect(p.selecao?.convidadoDaVez?.id).toBe(subId);

      // O convite aparece nas Decisões do convidado da vez.
      const decisoes = await http()
        .get('/decisoes?modo=medico')
        .set('Cookie', sub.cookies)
        .expect(200);
      expect(
        (decisoes.body as Array<{ tipo: string; plantao: { id: string } }>).some(
          (d) => d.tipo === 'ACEITAR_VAGA' && d.plantao.id === id,
        ),
      ).toBe(true);

      // Fora da vez, não.
      const fura = await comSessao(http().post(`/plantoes/${id}/convite/aceitar`), ter)
        .send({})
        .expect(409);
      expect(codigo(fura)).toBe('NAO_EH_CONVIDADO_DA_VEZ');

      await comSessao(http().post(`/plantoes/${id}/convite/recusar`), sub)
        .send({})
        .expect(204);

      const aceito = await comSessao(http().post(`/plantoes/${id}/convite/aceitar`), ter)
        .send({})
        .expect(201);
      expect((aceito.body as Plantao).status).toBe('CONFIRMADO');
      expect((aceito.body as Plantao).executante?.id).toBe(terId);

      expect(await avisos(id, CHEFIA)).toContain('VAGA_PREENCHIDA');
      expect(await avisos(id, TITULAR)).toEqual(['CANDIDATURA_ENCERRADA']);
      // Quem aceitou não recebe "você foi escalado": foi ele quem aceitou.
      expect(await avisos(id, TERCEIRO)).toEqual(['CONVITE_RECEBIDO']);
    });

    it('fila sem ninguém mais: a vaga volta a ABERTO e a chefia é avisada', async () => {
      const id = await vaga();
      const subId = await idDoMedico(SUBSTITUTO);
      const chefia = await entrar(CHEFIA);
      const sub = await entrar(SUBSTITUTO);

      await comSessao(http().post(`/plantoes/${id}/convites`), chefia)
        .send({ indicados: [subId] })
        .expect(201);
      await comSessao(http().post(`/plantoes/${id}/convite/recusar`), sub)
        .send({})
        .expect(204);

      // A 1200 dias, ninguém declarou disponibilidade: o matching não acha nada.
      expect(await statusDe(id)).toBe('ABERTO');
      expect(await avisos(id, CHEFIA)).toContain('FILA_ESGOTADA');
    });

    it('escalar direto durante a fila cancela o convite em curso, com aviso', async () => {
      const id = await vaga();
      const subId = await idDoMedico(SUBSTITUTO);
      const terId = await idDoMedico(TERCEIRO);
      const chefia = await entrar(CHEFIA);

      await comSessao(http().post(`/plantoes/${id}/convites`), chefia)
        .send({ indicados: [subId] })
        .expect(201);

      await comSessao(http().post(`/plantoes/${id}/atribuir`), chefia)
        .send({ medicoId: terId })
        .expect(201);

      expect(await statusDe(id)).toBe('CONFIRMADO');
      const convite = await prisma.convite.findFirstOrThrow({
        where: { plantaoId: id, medicoId: subId },
      });
      expect(convite.status).toBe('CANCELADO');
      expect(await avisos(id, SUBSTITUTO)).toEqual(['CONVITE_RECEBIDO', 'CONVITE_CANCELADO']);
    });

    it('a chefia encerra a fila; a vaga volta a ABERTO', async () => {
      const id = await vaga();
      const chefia = await entrar(CHEFIA);
      const subId = await idDoMedico(SUBSTITUTO);

      await comSessao(http().post(`/plantoes/${id}/convites`), chefia)
        .send({ indicados: [subId] })
        .expect(201);
      const r = await comSessao(http().post(`/plantoes/${id}/convites/encerrar`), chefia)
        .send({})
        .expect(201);
      expect((r.body as Plantao).status).toBe('ABERTO');
    });

    it('a escala da instituição mostra quem está com o convite', async () => {
      const id = await vaga();
      const chefia = await entrar(CHEFIA);
      const subId = await idDoMedico(SUBSTITUTO);
      const hospital = await prisma.instituicao.findUniqueOrThrow({
        where: { cnpj: HOSPITAL_CNPJ },
      });
      const plantao = await prisma.plantao.findUniqueOrThrow({ where: { id } });

      await comSessao(http().post(`/plantoes/${id}/convites`), chefia)
        .send({ indicados: [subId] })
        .expect(201);

      const r = await http()
        .get(`/instituicoes/${hospital.id}/plantoes`)
        .query({
          desde: new Date(plantao.inicio.getTime() - 3_600_000).toISOString(),
          ate: new Date(plantao.fim.getTime() + 3_600_000).toISOString(),
        })
        .set('Cookie', chefia.cookies)
        .expect(200);
      const lido = (r.body as Plantao[]).find((x) => x.id === id);
      expect(lido?.selecao?.convidadoDaVez?.id).toBe(subId);
    });
  });
});
