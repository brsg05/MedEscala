import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_CSRF_TOKEN, HEADER_CSRF_TOKEN } from '@medescala/contracts';
import { hashDe, type ConteudoDoTermo } from '../../src/modules/termos/domain/conteudo';
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

interface Termo {
  id: string;
  tipo: string;
  hash: string;
  vigente: boolean;
  assinaturas: Array<{ papel: string; acao: string }>;
  pendentes: string[];
}

/**
 * F13 — termos contratuais (DEC-184 a DEC-187). Plantões a mais de 1500 dias,
 * menos o do check-in, que precisa estar perto de agora.
 */
describe('termos contratuais (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let deslocamento = 1500;

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

  async function idDoMedico(email: string): Promise<string> {
    const u = await prisma.usuario.findUniqueOrThrow({
      where: { email },
      include: { medico: { select: { id: true } } },
    });
    return u.medico?.id ?? '';
  }

  /** Vaga escalada direto para o titular. `emMinutos` controla o início. */
  async function escalado(emMinutos?: number): Promise<string> {
    deslocamento += 2;
    const chefia = await entrar(CHEFIA);
    const inicio = new Date(
      Date.now() + (emMinutos === undefined ? deslocamento * 86_400_000 : emMinutos * 60_000),
    );
    const vaga = await comSessao(http().post('/plantoes'), chefia)
      .send({
        setorId: SETOR_ID,
        inicio: inicio.toISOString(),
        fim: new Date(inicio.getTime() + 12 * 3_600_000).toISOString(),
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

  async function termos(plantaoId: string, s: Sessao): Promise<Termo[]> {
    const r = await http()
      .get(`/plantoes/${plantaoId}/termos`)
      .set('Cookie', s.cookies)
      .expect(200);
    return r.body as Termo[];
  }

  // ---------------------------------------------------------------------------

  it('escala direta: contrato assinado pela instituição, médico pendente até o check-in', async () => {
    const id = await escalado(10);
    const titular = await entrar(TITULAR);

    const [antes] = await termos(id, titular);
    expect(antes?.tipo).toBe('CONTRATO_PLANTAO');
    expect(antes?.assinaturas.map((a) => a.papel)).toEqual(['INSTITUICAO']);
    expect(antes?.pendentes).toEqual(['MEDICO']);

    await comSessao(http().post(`/plantoes/${id}/execucao/inicio`), titular)
      .send({})
      .expect(201);

    const [depois] = await termos(id, titular);
    expect(depois?.pendentes).toEqual([]);
    expect(depois?.assinaturas.find((a) => a.papel === 'MEDICO')?.acao).toBe('Fez check-in');
    // O aceite cobre o mesmo conteúdo: o hash não muda com a assinatura.
    expect(depois?.hash).toBe(antes?.hash);
  });

  it('repasse aprovado: termo de substituição com as três assinaturas; o contrato perde a vigência', async () => {
    const id = await escalado();
    const titular = await entrar(TITULAR);
    const sub = await entrar(SUBSTITUTO);
    const chefia = await entrar(CHEFIA);

    const aberto = await comSessao(http().post(`/plantoes/${id}/repasses`), titular)
      .send({ motivo: 'Teste dos termos contratuais', indicados: [await idDoMedico(SUBSTITUTO)] })
      .expect(201);
    const repasseId = (aberto.body as { id: string }).id;
    await comSessao(http().post(`/repasses/${repasseId}/aceitar`), sub)
      .send({})
      .expect(200);
    await comSessao(http().post(`/repasses/${repasseId}/aprovar`), chefia)
      .send({})
      .expect(200);

    const lista = await termos(id, sub);
    const substituicao = lista.find((t) => t.tipo === 'SUBSTITUICAO');
    const contrato = lista.find((t) => t.tipo === 'CONTRATO_PLANTAO');

    expect(substituicao?.vigente).toBe(true);
    expect(substituicao?.pendentes).toEqual([]);
    expect(substituicao?.assinaturas.map((a) => a.acao).sort()).toEqual([
      'Aceitou o convite',
      'Aprovou a substituição',
      'Pediu o repasse',
    ]);
    expect(contrato?.vigente).toBe(false);
  });

  it('candidatura escolhida: as duas partes assinam na hora', async () => {
    deslocamento += 2;
    const chefia = await entrar(CHEFIA);
    const sub = await entrar(SUBSTITUTO);
    const inicio = new Date(Date.now() + deslocamento * 86_400_000);
    const vaga = await comSessao(http().post('/plantoes'), chefia)
      .send({
        setorId: SETOR_ID,
        inicio: inicio.toISOString(),
        fim: new Date(inicio.getTime() + 12 * 3_600_000).toISOString(),
        valorCentavos: 140_000,
        especialidadeExigida: 'Clínica Médica',
        requisitos: [],
        modeloContratacao: 'PJ',
      })
      .expect(201);
    const id = (vaga.body as { id: string }).id;

    const c = await comSessao(http().post(`/plantoes/${id}/candidaturas`), sub)
      .send({})
      .expect(201);
    const candidaturaId = (c.body as { minhaCandidatura: { id: string } }).minhaCandidatura.id;
    await comSessao(http().post(`/candidaturas/${candidaturaId}/aceitar`), chefia)
      .send({})
      .expect(201);

    const [contrato] = await termos(id, sub);
    expect(contrato?.pendentes).toEqual([]);
    expect(contrato?.assinaturas.map((a) => a.acao).sort()).toEqual([
      'Candidatou-se à vaga',
      'Escolheu a candidatura',
    ]);
  });

  it('o PDF sai do retrato, e quem não participa não vê nem a lista nem o PDF', async () => {
    const id = await escalado();
    const titular = await entrar(TITULAR);
    const [termo] = await termos(id, titular);

    const pdf = await http()
      .get(`/termos/${termo?.id ?? ''}/pdf`)
      .set('Cookie', titular.cookies)
      .buffer(true)
      .parse((res, fim) => {
        const partes: Buffer[] = [];
        res.on('data', (b: Buffer) => partes.push(b));
        res.on('end', () => fim(null, Buffer.concat(partes)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const terceiro = await entrar(TERCEIRO);
    await http().get(`/plantoes/${id}/termos`).set('Cookie', terceiro.cookies).expect(404);
    await http()
      .get(`/termos/${termo?.id ?? ''}/pdf`)
      .set('Cookie', terceiro.cookies)
      .expect(404);
  });

  it('o hash confere com o conteúdo guardado, e o banco recusa alterar o termo (DEC-187)', async () => {
    const id = await escalado();
    const termo = await prisma.termo.findFirstOrThrow({ where: { plantaoId: id } });

    // O JSONB reordenou as chaves; o JSON canônico recalcula o mesmo hash.
    expect(hashDe(termo.conteudo as unknown as ConteudoDoTermo)).toBe(termo.hash);

    await expect(
      prisma.termo.update({
        where: { id: termo.id },
        data: { conteudo: { adulterado: true } },
      }),
    ).rejects.toThrow(/imutável/u);
  });
});
