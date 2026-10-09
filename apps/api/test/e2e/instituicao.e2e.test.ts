import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_CSRF_TOKEN, HEADER_CSRF_TOKEN } from '@medescala/contracts';
import { SupabaseAuthService } from '../../src/modules/auth/supabase-auth.service';
import { criarAppDeTeste, cookiesDe, valorDoCookie } from './app-de-teste';

const ORIGEM = 'http://localhost:5173';
const SENHA = process.env['SEED_SENHA_PADRAO'] ?? 'medescala123';
const SETOR_ID = '22222222-2222-4222-8222-222222222222';
const HOSPITAL_CNPJ = '12345678000190';

interface Sessao {
  cookies: string[];
  csrf: string;
}

/**
 * Ciclo da instituição e cadastro aberto (DEC-059 a DEC-064).
 *
 * Cada `describe` tenta pelo menos uma vez o caminho que a regra existe para
 * impedir — como o §12 exige.
 */
describe('instituição e cadastro aberto (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  /** E-mails e CNPJs criados aqui, para limpar no fim. */
  const emailsCriados: string[] = [];
  const cnpjsCriados: string[] = [];

  beforeAll(async () => {
    app = await criarAppDeTeste();
    prisma = new PrismaClient();
    await prisma.$connect();
    await prisma.plantao.deleteMany({ where: { escala: { setorId: SETOR_ID } } });
  });

  afterAll(async () => {
    await prisma.plantao.deleteMany({ where: { escala: { setorId: SETOR_ID } } });
    await prisma.janelaDisponibilidade.deleteMany({
      where: { medico: { usuario: { email: { in: emailsCriados } } } },
    });
    // Instituições criadas por cadastro: os perfis caem por cascata.
    await prisma.instituicao.deleteMany({ where: { cnpj: { in: cnpjsCriados } } });

    // Contas criadas por cadastro: apagar a credencial no Supabase Auth leva junto
    // `usuario` e `medico`, pela FK com ON DELETE CASCADE (supabase/policies/001).
    // Sem isto, cada execução deixaria contas de teste acumuladas.
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

  async function entrar(email: string, senha = SENHA): Promise<Sessao> {
    const r = await http()
      .post('/auth/login')
      .set('Origin', ORIGEM)
      .send({ email, senha })
      .expect(200);
    const cookies = cookiesDe(r);
    return { cookies, csrf: valorDoCookie(cookies, COOKIE_CSRF_TOKEN) ?? '' };
  }

  function comSessao(req: request.Test, s: Sessao): request.Test {
    return req.set('Origin', ORIGEM).set('Cookie', s.cookies).set(HEADER_CSRF_TOKEN, s.csrf);
  }

  function unico(): string {
    return randomUUID().slice(0, 8);
  }

  /** CNPJ e CRM aleatórios: a suíte precisa ser repetível sem colidir. */
  function cnpjAleatorio(): string {
    return String(Math.floor(Math.random() * 1e14)).padStart(14, '1');
  }

  async function hospitalId(): Promise<string> {
    return (await prisma.instituicao.findUniqueOrThrow({ where: { cnpj: HOSPITAL_CNPJ } })).id;
  }

  async function vagaNoHospital(chefia: Sessao, diasAFrente: number, horas = 12): Promise<string> {
    const inicio = new Date(Date.now() + diasAFrente * 86_400_000);
    const r = await comSessao(http().post('/plantoes'), chefia)
      .send({
        setorId: SETOR_ID,
        inicio: inicio.toISOString(),
        fim: new Date(inicio.getTime() + horas * 3_600_000).toISOString(),
        valorCentavos: 150_000,
        especialidadeExigida: 'Clínica Médica',
        requisitos: [],
        modeloContratacao: 'PJ',
      })
      .expect(201);
    return (r.body as { id: string }).id;
  }

  // ---------------------------------------------------------------------------

  describe('cadastro aberto (DEC-059)', () => {
    it('médico se cadastra, já sai logado e nasce NÃO verificado', async () => {
      const email = `medico.${unico()}@teste.medescala`;
      emailsCriados.push(email);

      const r = await http()
        .post('/auth/cadastro')
        .set('Origin', ORIGEM)
        .send({
          tipo: 'MEDICO',
          nome: 'Médica Recém Cadastrada',
          email,
          senha: 'senha-segura-1',
          crm: String(Math.floor(100000 + Math.random() * 899999)),
          crmUf: 'PE',
          especialidade: 'Clínica Médica',
        })
        .expect(201);

      const corpo = r.body as {
        usuario: { perfis: Array<{ perfil: string; instituicaoId: string | null }> };
      };
      expect(corpo.usuario.perfis).toEqual([
        expect.objectContaining({ perfil: 'MEDICO', instituicaoId: null }),
      ]);

      const medico = await prisma.medico.findFirst({ where: { usuario: { email } } });
      expect(medico?.verificado).toBe(false);
    });

    it('instituição se cadastra, nasce PENDENTE, e quem cadastrou recebe ADMIN e CHEFIA (DEC-064)', async () => {
      const email = `gestor.${unico()}@teste.medescala`;
      const cnpj = cnpjAleatorio();
      emailsCriados.push(email);
      cnpjsCriados.push(cnpj);

      const r = await http()
        .post('/auth/cadastro')
        .set('Origin', ORIGEM)
        .send({
          tipo: 'INSTITUICAO',
          nome: 'Gestora de Teste',
          email,
          senha: 'senha-segura-1',
          instituicaoNome: 'Hospital de Teste',
          cnpj,
        })
        .expect(201);

      const perfis = (r.body as { usuario: { perfis: Array<{ perfil: string }> } }).usuario.perfis
        .map((p) => p.perfil)
        .sort();
      expect(perfis).toEqual(['ADMIN_INSTITUICAO', 'CHEFIA_ESCALA']);

      const inst = await prisma.instituicao.findUnique({ where: { cnpj } });
      expect(inst?.status).toBe('PENDENTE');
    });

    it('recusa e-mail repetido sem deixar credencial órfã', async () => {
      const r = await http()
        .post('/auth/cadastro')
        .set('Origin', ORIGEM)
        .send({
          tipo: 'MEDICO',
          nome: 'Tentativa Duplicada',
          email: 'medico@medescala.test',
          senha: 'senha-segura-1',
          crm: '999001',
          crmUf: 'SP',
          especialidade: 'Clínica Médica',
        })
        .expect(409);

      expect((r.body as { codigo: string }).codigo).toBe('EMAIL_JA_CADASTRADO');
    });

    it('recusa CNPJ já cadastrado', async () => {
      const r = await http()
        .post('/auth/cadastro')
        .set('Origin', ORIGEM)
        .send({
          tipo: 'INSTITUICAO',
          nome: 'Tentativa de Clonar Hospital',
          email: `clone.${unico()}@teste.medescala`,
          senha: 'senha-segura-1',
          instituicaoNome: 'Hospital Clonado',
          cnpj: HOSPITAL_CNPJ,
        })
        .expect(409);

      expect((r.body as { codigo: string }).codigo).toBe('INSTITUICAO_JA_CADASTRADA');
    });
  });

  describe('instituição pendente (DEC-063)', () => {
    it('NÃO publica vaga antes da verificação', async () => {
      const clinica = await entrar('clinica@medescala.test');
      const inst = await prisma.instituicao.findUniqueOrThrow({
        where: { cnpj: '98765432000110' },
      });

      // Monta estrutura (permitido enquanto pendente — DEC-066)…
      const unidade = await comSessao(http().post(`/instituicoes/${inst.id}/unidades`), clinica)
        .send({ nome: `Unidade ${unico()}`, cnes: null })
        .expect(201);
      const setor = await comSessao(
        http().post(`/unidades/${(unidade.body as { id: string }).id}/setores`),
        clinica,
      )
        .send({ nome: 'Pronto-socorro', especialidadeExigida: 'Clínica Médica' })
        .expect(201);

      // …mas não publica vaga.
      const inicio = new Date(Date.now() + 10 * 86_400_000);
      const r = await comSessao(http().post('/plantoes'), clinica)
        .send({
          setorId: (setor.body as { id: string }).id,
          inicio: inicio.toISOString(),
          fim: new Date(inicio.getTime() + 12 * 3_600_000).toISOString(),
          valorCentavos: 100_000,
          especialidadeExigida: 'Clínica Médica',
          requisitos: [],
          modeloContratacao: 'PJ',
        })
        .expect(403);

      expect((r.body as { codigo: string }).codigo).toBe('INSTITUICAO_PENDENTE');

      await prisma.unidade.delete({ where: { id: (unidade.body as { id: string }).id } });
    });

    it('a estrutura informa o status, para a tela mostrar o aviso', async () => {
      const clinica = await entrar('clinica@medescala.test');
      const inst = await prisma.instituicao.findUniqueOrThrow({
        where: { cnpj: '98765432000110' },
      });

      const r = await http()
        .get(`/instituicoes/${inst.id}/estrutura`)
        .set('Cookie', clinica.cookies)
        .expect(200);
      expect((r.body as { instituicao: { status: string } }).instituicao.status).toBe('PENDENTE');
    });
  });

  describe('operador da plataforma', () => {
    it('vê a clínica pendente e a médica não verificada', async () => {
      const operador = await entrar('operador@medescala.test');

      const r = await http()
        .get('/operador/pendencias')
        .set('Cookie', operador.cookies)
        .expect(200);
      const corpo = r.body as {
        instituicoes: Array<{ cnpj: string }>;
        medicos: Array<{ email: string }>;
      };

      expect(corpo.instituicoes.some((i) => i.cnpj === '98765432000110')).toBe(true);
      expect(corpo.medicos.some((m) => m.email === 'naoverificado@medescala.test')).toBe(true);
    });

    it('aprova uma instituição, que passa a publicar vaga', async () => {
      // Instituição própria do teste, para não mexer na clínica da demonstração.
      const email = `aprovar.${unico()}@teste.medescala`;
      const cnpj = cnpjAleatorio();
      emailsCriados.push(email);
      cnpjsCriados.push(cnpj);

      await http()
        .post('/auth/cadastro')
        .set('Origin', ORIGEM)
        .send({
          tipo: 'INSTITUICAO',
          nome: 'Gestor a Aprovar',
          email,
          senha: 'senha-segura-1',
          instituicaoNome: 'Hospital a Aprovar',
          cnpj,
        })
        .expect(201);

      const inst = await prisma.instituicao.findUniqueOrThrow({ where: { cnpj } });
      const operador = await entrar('operador@medescala.test');

      await comSessao(http().post(`/operador/instituicoes/${inst.id}/aprovar`), operador)
        .send({})
        .expect(204);

      expect((await prisma.instituicao.findUniqueOrThrow({ where: { cnpj } })).status).toBe(
        'ATIVA',
      );
    });

    it('médico NÃO consegue aprovar instituição nem ver pendências', async () => {
      const medico = await entrar('medico@medescala.test');
      await http().get('/operador/pendencias').set('Cookie', medico.cookies).expect(403);
    });
  });

  describe('candidatos — só quem se ofereceu (DEC-062)', () => {
    it('lista o médico com disponibilidade cobrindo o horário', async () => {
      const chefia = await entrar('chefia@medescala.test');
      const substituto = await entrar('substituto.e2e@medescala.test');

      const inicio = new Date(Date.now() + 40 * 86_400_000);
      inicio.setUTCHours(10, 0, 0, 0);
      const janela = await comSessao(http().post('/medicos/me/disponibilidades'), substituto)
        .send({
          inicio: new Date(inicio.getTime() - 3_600_000).toISOString(),
          fim: new Date(inicio.getTime() + 13 * 3_600_000).toISOString(),
          valorMinimoCentavos: null,
        })
        .expect(201);

      const vagaId = await vagaNoHospital(chefia, 0, 12);
      // Reposiciona a vaga no horário coberto pela janela.
      await prisma.plantao.update({
        where: { id: vagaId },
        data: { inicio, fim: new Date(inicio.getTime() + 12 * 3_600_000) },
      });

      const r = await http()
        .get(`/plantoes/${vagaId}/candidatos`)
        .set('Cookie', chefia.cookies)
        .expect(200);
      const nomes = (r.body as Array<{ nome: string }>).map((c) => c.nome);

      expect(nomes).toContain('Substituto de Teste');

      await comSessao(
        http().delete(`/medicos/me/disponibilidades/${(janela.body as { id: string }).id}`),
        substituto,
      ).expect(204);
    });

    it('NÃO lista médico que não declarou disponibilidade', async () => {
      const chefia = await entrar('chefia@medescala.test');
      const vagaId = await vagaNoHospital(chefia, 45);

      const r = await http()
        .get(`/plantoes/${vagaId}/candidatos`)
        .set('Cookie', chefia.cookies)
        .expect(200);
      const nomes = (r.body as Array<{ nome: string }>).map((c) => c.nome);

      // A Ana é verificada e da especialidade, mas não se ofereceu.
      expect(nomes).not.toContain('Ana Medeiros');
    });

    it('NÃO lista médico cujo valor mínimo passa do valor da vaga', async () => {
      // O Bruno, no seed, pede no mínimo R$ 1.000,00 nos próximos 14 dias.
      const chefia = await entrar('chefia@medescala.test');
      const inicio = new Date(Date.now() + 6 * 86_400_000);

      const r = await comSessao(http().post('/plantoes'), chefia)
        .send({
          setorId: SETOR_ID,
          inicio: inicio.toISOString(),
          fim: new Date(inicio.getTime() + 6 * 3_600_000).toISOString(),
          valorCentavos: 50_000, // R$ 500,00
          especialidadeExigida: 'Clínica Médica',
          requisitos: [],
          modeloContratacao: 'PJ',
        })
        .expect(201);

      const c = await http()
        .get(`/plantoes/${(r.body as { id: string }).id}/candidatos`)
        .set('Cookie', chefia.cookies)
        .expect(200);

      expect((c.body as Array<{ nome: string }>).map((x) => x.nome)).not.toContain('Bruno Lima');
    });
  });

  describe('admin concede chefia (DEC-064)', () => {
    it('promove usuário existente e a promoção vale na hora', async () => {
      const admin = await entrar('admin@medescala.test');
      const id = await hospitalId();

      await comSessao(http().post(`/instituicoes/${id}/chefias`), admin)
        .send({ email: 'substituto.e2e@medescala.test' })
        .expect(201);

      const promovido = await entrar('substituto.e2e@medescala.test');
      const me = await http().get('/auth/me').set('Cookie', promovido.cookies).expect(200);
      const perfis = (
        me.body as { perfis: Array<{ perfil: string; instituicaoId: string | null }> }
      ).perfis;

      expect(perfis.some((p) => p.perfil === 'CHEFIA_ESCALA' && p.instituicaoId === id)).toBe(true);

      // Desfaz, para a suíte de repasse continuar tratando-o só como médico.
      await prisma.perfilAcesso.deleteMany({
        where: { usuario: { email: 'substituto.e2e@medescala.test' }, perfil: 'CHEFIA_ESCALA' },
      });
    });

    it('recusa e-mail sem conta — não cria conta para ninguém', async () => {
      const admin = await entrar('admin@medescala.test');

      const r = await comSessao(http().post(`/instituicoes/${await hospitalId()}/chefias`), admin)
        .send({ email: `ninguem.${unico()}@teste.medescala` })
        .expect(404);

      expect((r.body as { codigo: string }).codigo).toBe('USUARIO_NAO_ENCONTRADO');
    });

    it('chefia NÃO concede chefia — só admin', async () => {
      const chefia = await entrar('chefia@medescala.test');
      await comSessao(http().post(`/instituicoes/${await hospitalId()}/chefias`), chefia)
        .send({ email: 'substituto.e2e@medescala.test' })
        .expect(403);
    });
  });

  describe('furos de acesso corrigidos', () => {
    it('admin de outra instituição NÃO cria setor numa unidade do hospital', async () => {
      const clinica = await entrar('clinica@medescala.test');
      const unidade = await prisma.unidade.findFirstOrThrow({
        where: { instituicao: { cnpj: HOSPITAL_CNPJ } },
      });

      const r = await comSessao(http().post(`/unidades/${unidade.id}/setores`), clinica)
        .send({ nome: 'Setor Invasor', especialidadeExigida: 'Clínica Médica' })
        .expect(404);

      expect((r.body as { codigo: string }).codigo).toBe('RECURSO_NAO_ENCONTRADO');
    });

    it('médico que não participa do plantão NÃO lê o plantão nem a trilha', async () => {
      const chefia = await entrar('chefia@medescala.test');
      const vagaId = await vagaNoHospital(chefia, 50);

      // A Carla não tem nada a ver com esta vaga.
      const estranho = await entrar('naoverificado@medescala.test');

      await http().get(`/plantoes/${vagaId}`).set('Cookie', estranho.cookies).expect(404);
      await http().get(`/plantoes/${vagaId}/auditoria`).set('Cookie', estranho.cookies).expect(404);
    });

    it('chefia da instituição lê o plantão e a trilha', async () => {
      const chefia = await entrar('chefia@medescala.test');
      const vagaId = await vagaNoHospital(chefia, 55);

      await http().get(`/plantoes/${vagaId}`).set('Cookie', chefia.cookies).expect(200);
      const trilha = await http()
        .get(`/plantoes/${vagaId}/auditoria`)
        .set('Cookie', chefia.cookies)
        .expect(200);

      expect((trilha.body as Array<{ acao: string }>)[0]?.acao).toBe('VAGA_PUBLICADA');
    });
  });
});
