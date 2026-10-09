/**
 * Seed idempotente — rodar duas vezes não duplica nada.
 *
 * Serve a três consumidores: desenvolvimento local, testes e2e e a demo da
 * Entrega 5. É também onde a "massa fixa" do matching determinístico (Sprint 2)
 * vai morar quando chegar a hora.
 *
 * Cria um usuário por perfil do ADR-006, porque o critério de aceite do Sprint 0
 * exige provar 401 sem token e 403 com perfil errado — e isso pede pelo menos dois
 * perfis distintos existindo de verdade.
 */
import { PrismaClient, Perfil } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { calcularRetencoes } from '@medescala/contracts';
import type { Prisma } from '@prisma/client';
import {
  hashDe,
  montarContrato,
  registroDeCnpj,
  registroDeCrm,
} from '../src/modules/termos/domain/conteudo';

const prisma = new PrismaClient();

const supabase = createClient(
  obrigatoria('SUPABASE_URL'),
  obrigatoria('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const SENHA = process.env['SEED_SENHA_PADRAO'] ?? 'medescala123';

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (valor === undefined || valor === '') {
    throw new Error(`Variável ${nome} não definida — veja apps/api/.env.example`);
  }
  return valor;
}

const INSTITUICAO = {
  cnpj: '12345678000190',
  nome: 'Hospital Escola MedEscala',
};

// Ids fixos deixam o seed idempotente e dão aos testes um alvo estável — é a
// "massa fixa" que o critério de matching determinístico do Sprint 2 vai exigir.
const UNIDADE_ID = '11111111-1111-4111-8111-111111111111';
const SETOR_ID = '22222222-2222-4222-8222-222222222222';

/**
 * Setor só da demonstração. Fica separado do SETOR_ID porque a suíte e2e apaga os
 * plantões do setor de teste antes de rodar — se a demo morasse lá, cada
 * `pnpm test:e2e` esvaziaria a tela de quem está apresentando.
 */
const SETOR_DEMO_ID = '66666666-6666-4666-8666-666666666666';

interface Semente {
  email: string;
  nome: string;
  /** `null` quando o perfil vem de outra rotina do seed (ex.: dono da clínica pendente). */
  perfil: Perfil | null;
  comInstituicao: boolean;
  /** Preenchido para quem também é médico (F01). */
  medico?: { crm: string; crmUf: string; especialidade: string; verificado: boolean };
}

const USUARIOS: readonly Semente[] = [
  {
    email: 'medico@medescala.test',
    nome: 'Ana Medeiros',
    perfil: Perfil.MEDICO,
    comInstituicao: true,
    medico: { crm: '12345', crmUf: 'PE', especialidade: 'Clínica Médica', verificado: true },
  },
  {
    // Sem um segundo medico nao ha substituto, e sem substituto nao ha repasse.
    email: 'substituto@medescala.test',
    nome: 'Bruno Lima',
    perfil: Perfil.MEDICO,
    comInstituicao: true,
    medico: { crm: '54321', crmUf: 'PE', especialidade: 'Clínica Médica', verificado: true },
  },
  {
    // Dono de uma instituição recém-cadastrada, ainda PENDENTE (DEC-063): serve
    // para ver o aviso de verificação e a fila do operador.
    email: 'clinica@medescala.test',
    nome: 'Clara Gestora',
    perfil: null,
    comInstituicao: false,
  },
  {
    // Usuários exclusivos da suíte e2e. A agenda da Ana é a da demonstração;
    // se os testes a usassem, a exclusion constraint da RN03 recusaria os
    // plantões de teste que caem em cima dos plantões de demonstração.
    email: 'titular.e2e@medescala.test',
    nome: 'Titular de Teste',
    perfil: Perfil.MEDICO,
    comInstituicao: true,
    medico: { crm: '70001', crmUf: 'PE', especialidade: 'Clínica Médica', verificado: true },
  },
  {
    // Terceiro médico de teste: a ordem da fila de convites (DEC-089) só é
    // testável com pelo menos dois convidados além do titular.
    email: 'terceiro.e2e@medescala.test',
    nome: 'Terceiro de Teste',
    perfil: Perfil.MEDICO,
    comInstituicao: true,
    medico: { crm: '70003', crmUf: 'PE', especialidade: 'Clínica Médica', verificado: true },
  },
  {
    email: 'substituto.e2e@medescala.test',
    nome: 'Substituto de Teste',
    perfil: Perfil.MEDICO,
    comInstituicao: true,
    medico: { crm: '70002', crmUf: 'PE', especialidade: 'Clínica Médica', verificado: true },
  },
  {
    // Alvo do teste da RN02: existe, mas o CRM nao foi conferido.
    email: 'naoverificado@medescala.test',
    nome: 'Carla Novata',
    perfil: Perfil.MEDICO,
    comInstituicao: true,
    medico: { crm: '99999', crmUf: 'PE', especialidade: 'Clínica Médica', verificado: false },
  },
  {
    email: 'chefia@medescala.test',
    nome: 'Dr. Carlos Chefe',
    perfil: Perfil.CHEFIA_ESCALA,
    comInstituicao: true,
  },
  {
    email: 'admin@medescala.test',
    nome: 'Adriana Admin',
    perfil: Perfil.ADMIN_INSTITUICAO,
    comInstituicao: true,
  },
  {
    email: 'operador@medescala.test',
    nome: 'Otávio Operador',
    perfil: Perfil.OPERADOR_PLATAFORMA,
    comInstituicao: false,
  },
];

/** Cria no Supabase Auth ou devolve o id de quem já existe. */
async function garantirCredencial(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
  });

  if (error === null && data.user !== null) {
    return data.user.id;
  }

  // Já existe: localiza pelo e-mail em vez de falhar.
  const { data: lista, error: erroLista } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  if (erroLista !== null) {
    throw new Error(`Não foi possível listar usuários do Supabase: ${erroLista.message}`);
  }

  const encontrado = lista.users.find((u) => u.email === email);

  if (encontrado === undefined) {
    throw new Error(`Falha ao criar ${email}: ${error?.message ?? 'motivo desconhecido'}`);
  }

  return encontrado.id;
}

async function principal(): Promise<void> {
  // O hospital de demonstração já nasce verificado: instituição nova nasce
  // PENDENTE (DEC-063), mas a demo precisa de uma que publique vaga.
  const instituicao = await prisma.instituicao.upsert({
    where: { cnpj: INSTITUICAO.cnpj },
    // Modelo B habilitado na demonstração, para o alerta da DEC-203 aparecer.
    update: { nome: INSTITUICAO.nome, status: 'ATIVA', permiteSubcontratacao: true },
    create: {
      ...INSTITUICAO,
      status: 'ATIVA',
      verificadaEm: new Date(),
      permiteSubcontratacao: true,
    },
  });

  console.log(`instituição  ${instituicao.nome}`);

  for (const semente of USUARIOS) {
    const id = await garantirCredencial(semente.email);

    await prisma.usuario.upsert({
      where: { id },
      update: { email: semente.email, nome: semente.nome },
      create: { id, email: semente.email, nome: semente.nome },
    });

    const instituicaoId = semente.comInstituicao ? instituicao.id : null;

    // `upsert` não serve aqui: a chave única envolve uma coluna nula, e o Prisma
    // não consegue endereçar `instituicaoId: null` num `where` composto.
    if (semente.perfil !== null) {
      const existente = await prisma.perfilAcesso.findFirst({
        where: { usuarioId: id, instituicaoId, perfil: semente.perfil },
      });

      if (existente === null) {
        await prisma.perfilAcesso.create({
          data: { usuarioId: id, instituicaoId, perfil: semente.perfil },
        });
      }
    }

    if (semente.medico !== undefined) {
      await prisma.medico.upsert({
        where: { usuarioId: id },
        update: {
          verificado: semente.medico.verificado,
          especialidade: semente.medico.especialidade,
        },
        create: {
          usuarioId: id,
          crm: semente.medico.crm,
          crmUf: semente.medico.crmUf,
          especialidade: semente.medico.especialidade,
          verificado: semente.medico.verificado,
          verificadoEm: semente.medico.verificado ? new Date() : null,
        },
      });
    }

    console.log(
      `usuário      ${semente.email.padEnd(30)} ${semente.perfil ?? '(perfis pela instituição)'}`,
    );
  }

  // F03 — unidade e setor, para haver onde publicar vaga.
  const unidade = await prisma.unidade.upsert({
    where: { id: UNIDADE_ID },
    update: { nome: 'UPA Torrões' },
    create: { id: UNIDADE_ID, instituicaoId: instituicao.id, nome: 'UPA Torrões', cnes: '1234567' },
  });

  const setor = await prisma.setor.upsert({
    where: { id: SETOR_ID },
    update: { nome: 'Sala Vermelha' },
    create: {
      id: SETOR_ID,
      unidadeId: unidade.id,
      nome: 'Sala Vermelha',
      especialidadeExigida: 'Clínica Médica',
    },
  });

  console.log(`unidade      ${unidade.nome}`);
  console.log(`setor        ${setor.nome} (${setor.especialidadeExigida})`);
  await semearDemonstracao(unidade.id);
  await semearInstituicaoPendente();
  await semearDisponibilidade();

  console.log(`\nSenha de todos: ${SENHA}`);
}

/**
 * Plantões de demonstração, relativos a HOJE — para a tela ter o que mostrar em
 * qualquer dia em que o seed rodar.
 *
 * São recriados a cada execução. A trilha de auditoria dos anteriores fica, e
 * deve ficar: ela é append-only. Os plantões são inseridos já com executante, o
 * que o trigger da RN01 permite — ele age em UPDATE, e só recusa TROCAR um
 * executante já definido.
 */
async function semearDemonstracao(unidadeId: string): Promise<void> {
  const setor = await prisma.setor.upsert({
    where: { id: SETOR_DEMO_ID },
    update: {},
    create: {
      id: SETOR_DEMO_ID,
      unidadeId,
      nome: 'UTI Adulto',
      especialidadeExigida: 'Clínica Médica',
    },
  });

  const ana = await prisma.medico.findFirstOrThrow({ where: { crm: '12345', crmUf: 'PE' } });
  const bruno = await prisma.medico.findFirstOrThrow({ where: { crm: '54321', crmUf: 'PE' } });

  await prisma.plantao.deleteMany({ where: { escala: { setorId: setor.id } } });

  function em(diasAPartirDeHoje: number, hora: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + diasAPartirDeHoje);
    d.setHours(hora, 0, 0, 0);
    return d;
  }

  async function escalaDe(inicio: Date): Promise<string> {
    const mes = String(inicio.getUTCMonth() + 1).padStart(2, '0');
    const competencia = `${String(inicio.getUTCFullYear())}-${mes}`;
    const escala = await prisma.escala.upsert({
      where: { setorId_competencia: { setorId: setor.id, competencia } },
      update: {},
      create: { setorId: setor.id, competencia },
    });
    return escala.id;
  }

  // F13 — os plantões da demonstração nascem com contrato, como na escala de
  // verdade: a chefia assinou ao escalar; a Ana, no check-in (DEC-185).
  const local = await prisma.setor.findUniqueOrThrow({
    where: { id: setor.id },
    include: { unidade: { include: { instituicao: true } } },
  });
  const inst = local.unidade.instituicao;
  const chefia = await prisma.usuario.findUniqueOrThrow({
    where: { email: 'chefia@medescala.test' },
  });
  const anaUsuario = await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuarioId } });

  async function contrato(p: { id: string; inicio: Date; fim: Date; checkinEm?: Date }) {
    const emitidoEm = new Date(p.inicio.getTime() - 7 * 86_400_000);
    const medico = {
      papel: 'MEDICO' as const,
      nome: anaUsuario.nome,
      registro: registroDeCrm(ana.crm, ana.crmUf),
    };
    const instituicao = {
      papel: 'INSTITUICAO' as const,
      nome: inst.nome,
      registro: registroDeCnpj(inst.cnpj),
    };
    const conteudo = montarContrato({
      plantao: {
        id: p.id,
        setor: local.nome,
        unidade: local.unidade.nome,
        instituicao: inst.nome,
        inicio: p.inicio.toISOString(),
        fim: p.fim.toISOString(),
        valorCentavos: 140_000,
        especialidade: 'Clínica Médica',
        modeloContratacao: 'PJ',
      },
      medico,
      instituicao,
      prazoContestacaoHoras: inst.prazoContestacaoHoras,
      emitidoEm,
    });
    const hash = hashDe(conteudo);
    await prisma.termo.create({
      data: {
        tipo: 'CONTRATO_PLANTAO',
        plantaoId: p.id,
        conteudo: conteudo as unknown as Prisma.InputJsonValue,
        hash,
        emitidoEm,
        assinaturas: {
          create: [
            {
              papel: 'INSTITUICAO',
              usuarioId: chefia.id,
              nome: instituicao.nome,
              registro: instituicao.registro,
              acao: 'Escalou o médico',
              assinadaEm: emitidoEm,
              hashAssinado: hash,
            },
            ...(p.checkinEm === undefined
              ? []
              : [
                  {
                    papel: 'MEDICO' as const,
                    usuarioId: anaUsuario.id,
                    nome: medico.nome,
                    registro: medico.registro,
                    acao: 'Fez check-in',
                    assinadaEm: p.checkinEm,
                    hashAssinado: hash,
                  },
                ]),
          ],
        },
      },
    });
  }

  async function plantao(
    inicio: Date,
    horas: number,
    status: 'CONFIRMADO' | 'EM_REPASSE' | 'EXECUTADO',
    execucao: { checkinEm?: Date; checkoutEm?: Date; contestavelAte?: Date } = {},
  ): Promise<{ id: string }> {
    const criado = await prisma.plantao.create({
      data: {
        escalaId: await escalaDe(inicio),
        inicio,
        fim: new Date(inicio.getTime() + horas * 3_600_000),
        valorCentavos: 140_000,
        especialidadeExigida: 'Clínica Médica',
        requisitos: [],
        modeloContratacao: 'PJ',
        medicoTitularId: ana.id,
        medicoExecutanteId: ana.id,
        status,
        ...execucao,
      },
      select: { id: true, inicio: true, fim: true },
    });
    await contrato({
      ...criado,
      ...(execucao.checkinEm === undefined ? {} : { checkinEm: execucao.checkinEm }),
    });
    await pagamento(criado.id, status, execucao);
    return criado;
  }

  /**
   * F15 — como na escala de verdade: a instituição reservou o valor ao escalar
   * (DEC-201); o plantão cumprido já foi capturado, com o rascunho da NFS-e
   * pronto para a Ana emitir (DEC-202).
   */
  async function pagamento(
    plantaoId: string,
    status: 'CONFIRMADO' | 'EM_REPASSE' | 'EXECUTADO',
    execucao: { checkoutEm?: Date; contestavelAte?: Date },
  ): Promise<void> {
    const valor = 140_000;
    const r = calcularRetencoes({
      valorCentavos: valor,
      prestador: { modelo: 'PJ', regime: ana.regimeTributario },
      tomadorOptanteDoSimples: false,
      issRetidoBp: inst.issRetidoBp,
      data: execucao.checkoutEm ?? new Date(),
    });
    const cumprido = status === 'EXECUTADO';
    const criado = await prisma.pagamento.create({
      data: {
        plantaoId,
        perna: 'PRINCIPAL',
        pagadorInstituicaoId: inst.id,
        beneficiarioMedicoId: ana.id,
        valorBrutoCentavos: valor,
        retidoCentavos: r.retidoCentavos,
        liquidoCentavos: valor - r.retidoCentavos,
        referenciaGateway: `sim_seed_${plantaoId.slice(0, 8)}`,
        status: cumprido ? 'RETIDO' : 'PRE_AUTORIZADO',
        ...(cumprido
          ? { retidoEm: execucao.checkoutEm ?? null, liberavelEm: execucao.contestavelAte ?? null }
          : {}),
      },
    });
    if (cumprido) {
      await prisma.documentoFiscal.create({
        data: {
          pagamentoId: criado.id,
          prestadorMedicoId: ana.id,
          prestadorNome: anaUsuario.nome,
          prestadorRegistro:
            ana.cnpj === null ? registroDeCrm(ana.crm, ana.crmUf) : registroDeCnpj(ana.cnpj),
          tomadorNome: inst.nome,
          tomadorRegistro: registroDeCnpj(inst.cnpj),
          discriminacao: `Serviço médico em Clínica Médica — plantão de ${local.nome}.`,
          valorServicoCentavos: valor,
          retencoes: r.linhas as unknown as Prisma.InputJsonValue,
          observacoes: r.observacoes,
          valorLiquidoCentavos: valor - r.retidoCentavos,
        },
      });
    }
  }

  // Anteontem — cumprido, com check-in e check-out, ainda contestável pela
  // chefia (F16, DEC-132).
  const checkout = em(-2, 19);
  await plantao(em(-2, 7), 12, 'EXECUTADO', {
    checkinEm: em(-2, 7),
    checkoutEm: checkout,
    contestavelAte: new Date(checkout.getTime() + 72 * 3_600_000),
  });

  // Ontem — terminou sem check-in: "sem confirmação" para a chefia (DEC-131).
  await plantao(em(-1, 7), 12, 'CONFIRMADO');

  // Hoje, diurno — aparece na régua ao abrir o app; check-in liberado (F16).
  await plantao(em(0, 7), 12, 'CONFIRMADO');

  // Daqui a 3 dias, noturno — confirmado e com folga para pedir repasse.
  await plantao(em(3, 19), 12, 'CONFIRMADO');

  // Daqui a 5 dias — repasse já aceito pelo Bruno, parado esperando a chefia.
  const emRepasse = await plantao(em(5, 7), 12, 'EM_REPASSE');
  // A Ana indicou o Bruno (Forma 1, DEC-087) e ele aceitou: o convite existe na
  // fila como ACEITO, e o repasse espera a chefia.
  const repasse = await prisma.repasse.create({
    data: {
      plantaoId: emRepasse.id,
      medicoTitularId: ana.id,
      medicoSubstitutoId: bruno.id,
      motivo: 'Convocação para congresso da sociedade de especialidade no mesmo dia.',
      status: 'AGUARDANDO_APROVACAO',
    },
  });
  await prisma.convite.create({
    data: {
      plantaoId: emRepasse.id,
      repasseId: repasse.id,
      medicoId: bruno.id,
      ordem: 1,
      origem: 'INDICACAO',
      status: 'ACEITO',
      ativadoEm: new Date(),
      prazoAte: new Date(Date.now() + 3_600_000),
      respondidoEm: new Date(),
    },
  });

  console.log(
    `demo         5 plantões da Ana em ${setor.nome} (anteontem cumprido, ontem sem confirmação, hoje, +3 dias, +5 dias em repasse)`,
  );
}

principal()
  .catch((erro: unknown) => {
    console.error('Falha no seed:', erro);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

/**
 * Uma instituição recém-cadastrada, PENDENTE (DEC-063), com a dona tendo ADMIN e
 * CHEFIA (DEC-064) — exatamente o que o cadastro aberto produz.
 */
async function semearInstituicaoPendente(): Promise<void> {
  const clinica = await prisma.instituicao.upsert({
    where: { cnpj: '98765432000110' },
    update: { status: 'PENDENTE', verificadaEm: null, verificadaPorId: null },
    create: { cnpj: '98765432000110', nome: 'Clínica Nova Esperança', status: 'PENDENTE' },
  });

  const clara = await prisma.usuario.findUniqueOrThrow({
    where: { email: 'clinica@medescala.test' },
  });

  // Remove o perfil solto, sem instituição, que uma versão anterior do seed criava.
  await prisma.perfilAcesso.deleteMany({ where: { usuarioId: clara.id, instituicaoId: null } });

  for (const perfil of [Perfil.ADMIN_INSTITUICAO, Perfil.CHEFIA_ESCALA]) {
    const existe = await prisma.perfilAcesso.findFirst({
      where: { usuarioId: clara.id, instituicaoId: clinica.id, perfil },
    });
    if (existe === null) {
      await prisma.perfilAcesso.create({
        data: { usuarioId: clara.id, instituicaoId: clinica.id, perfil },
      });
    }
  }

  console.log(`pendente     ${clinica.nome} (aguarda o operador)`);
}

/**
 * O Bruno declara disponibilidade para as próximas duas semanas — sem isto a
 * busca de candidatos fica sempre vazia, porque a chefia só enxerga quem se
 * ofereceu (DEC-062).
 */
async function semearDisponibilidade(): Promise<void> {
  const bruno = await prisma.medico.findFirstOrThrow({ where: { crm: '54321', crmUf: 'PE' } });

  await prisma.janelaDisponibilidade.deleteMany({ where: { medicoId: bruno.id } });

  const inicio = new Date();
  inicio.setDate(inicio.getDate() + 1);
  inicio.setHours(0, 0, 0, 0);

  await prisma.janelaDisponibilidade.create({
    data: {
      medicoId: bruno.id,
      inicio,
      fim: new Date(inicio.getTime() + 14 * 86_400_000),
      valorMinimoCentavos: 100_000,
    },
  });

  console.log('janela       Bruno disponível nos próximos 14 dias (mínimo R$ 1.000,00)');
}
