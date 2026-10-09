/**
 * Cenários da demonstração — o sistema "em uso", não vazio.
 *
 * Tudo em setores próprios (ids fixos abaixo), recriado a cada execução: o seed
 * continua idempotente, e a suíte e2e, que só mexe no setor de teste, não apaga
 * a demonstração. Relativo a HOJE, para servir em qualquer dia.
 *
 * Os dados respeitam as mesmas regras do banco que a api respeita: RN01 (insert
 * com executante é permitido; troca não), RN03 (sem sobreposição por médico),
 * um convidado da vez por plantão, split que fecha, nota emitida completa.
 */
import type { PrismaClient, Prisma, StatusPlantao } from '@prisma/client';
import { calcularRetencoes } from '@medescala/contracts';
import {
  hashDe,
  montarContrato,
  montarSubstituicao,
  registroDeCnpj,
  registroDeCrm,
  type Parte,
} from '../src/modules/termos/domain/conteudo';

const ESCOLA_PS_ID = '77777777-7777-4777-8777-000000000001';
const ESCOLA_PED_ID = '77777777-7777-4777-8777-000000000002';
const LUZIA_ID_UNIDADE = '88888888-8888-4888-8888-000000000001';
const LUZIA_PS_ID = '88888888-8888-4888-8888-000000000002';
const LUZIA_PED_ID = '88888888-8888-4888-8888-000000000003';
const SETORES_DOS_CENARIOS = [ESCOLA_PS_ID, ESCOLA_PED_ID, LUZIA_PS_ID, LUZIA_PED_ID];

const LUZIA = { cnpj: '23456789000101', nome: 'Hospital Santa Luzia' };

interface NovoMedico {
  email: string;
  nome: string;
  crm: string;
  especialidade: string;
  verificado: boolean;
  regime?: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO';
  cnpj?: string;
}

const MEDICOS: readonly NovoMedico[] = [
  {
    email: 'daniela@medescala.test',
    nome: 'Daniela Rocha',
    crm: '61001',
    especialidade: 'Clínica Médica',
    verificado: true,
    regime: 'LUCRO_PRESUMIDO',
    cnpj: '31000000000101',
  },
  {
    email: 'eduardo@medescala.test',
    nome: 'Eduardo Farias',
    crm: '61002',
    especialidade: 'Clínica Médica',
    verificado: true,
    regime: 'SIMPLES_NACIONAL',
    cnpj: '31000000000202',
  },
  {
    email: 'fernanda@medescala.test',
    nome: 'Fernanda Lins',
    crm: '61003',
    especialidade: 'Pediatria',
    verificado: true,
    regime: 'LUCRO_PRESUMIDO',
    cnpj: '31000000000303',
  },
  {
    email: 'gustavo@medescala.test',
    nome: 'Gustavo Tavares',
    crm: '61004',
    especialidade: 'Pediatria',
    verificado: true,
  },
  {
    email: 'helena@medescala.test',
    nome: 'Helena Moura',
    crm: '61005',
    especialidade: 'Clínica Médica',
    verificado: true,
    regime: 'LUCRO_PRESUMIDO',
    cnpj: '31000000000505',
  },
  {
    email: 'igor@medescala.test',
    nome: 'Igor Cavalcanti',
    crm: '61006',
    especialidade: 'Clínica Médica',
    verificado: true,
  },
  {
    email: 'julia@medescala.test',
    nome: 'Júlia Barros',
    crm: '61007',
    especialidade: 'Clínica Médica',
    verificado: false,
  },
  {
    email: 'lucas@medescala.test',
    nome: 'Lucas Pimentel',
    crm: '61008',
    especialidade: 'Pediatria',
    verificado: false,
  },
];

type Credencial = (email: string) => Promise<string>;

export async function semearCenarios(
  prisma: PrismaClient,
  garantirCredencial: Credencial,
): Promise<void> {
  // --- pessoas ------------------------------------------------------------------

  const ids = new Map<string, string>(); // e-mail → medicoId

  for (const m of MEDICOS) {
    const usuarioId = await garantirCredencial(m.email);
    await prisma.usuario.upsert({
      where: { id: usuarioId },
      update: { nome: m.nome, email: m.email },
      create: { id: usuarioId, nome: m.nome, email: m.email },
    });
    const perfil = await prisma.perfilAcesso.findFirst({
      where: { usuarioId, perfil: 'MEDICO', instituicaoId: null },
    });
    if (perfil === null) {
      await prisma.perfilAcesso.create({
        data: { usuarioId, perfil: 'MEDICO', instituicaoId: null },
      });
    }
    const medico = await prisma.medico.upsert({
      where: { usuarioId },
      update: {
        verificado: m.verificado,
        especialidade: m.especialidade,
        regimeTributario: m.regime ?? null,
        cnpj: m.cnpj ?? null,
      },
      create: {
        usuarioId,
        crm: m.crm,
        crmUf: 'PE',
        especialidade: m.especialidade,
        verificado: m.verificado,
        verificadoEm: m.verificado ? new Date() : null,
        regimeTributario: m.regime ?? null,
        cnpj: m.cnpj ?? null,
      },
    });
    ids.set(m.email, medico.id);
  }

  const ana = await prisma.medico.findFirstOrThrow({
    where: { crm: '12345', crmUf: 'PE' },
    include: { usuario: true },
  });
  const bruno = await prisma.medico.findFirstOrThrow({
    where: { crm: '54321', crmUf: 'PE' },
    include: { usuario: true },
  });
  ids.set('ana', ana.id);
  ids.set('bruno', bruno.id);
  const medico = (chave: string): string => {
    const id = ids.get(chave);
    if (id === undefined) throw new Error(`médico ${chave} não semeado`);
    return id;
  };

  const chefiaEscola = await prisma.usuario.findUniqueOrThrow({
    where: { email: 'chefia@medescala.test' },
  });

  // --- instituições e setores ------------------------------------------------------

  const escola = await prisma.instituicao.findUniqueOrThrow({ where: { cnpj: '12345678000190' } });
  const unidadeEscola = await prisma.unidade.findFirstOrThrow({
    where: { instituicaoId: escola.id },
  });

  const luzia = await prisma.instituicao.upsert({
    where: { cnpj: LUZIA.cnpj },
    update: { nome: LUZIA.nome, status: 'ATIVA', issRetidoBp: 500 },
    create: { ...LUZIA, status: 'ATIVA', verificadaEm: new Date(), issRetidoBp: 500 },
  });
  const unidadeLuzia = await prisma.unidade.upsert({
    where: { id: LUZIA_ID_UNIDADE },
    update: {},
    create: {
      id: LUZIA_ID_UNIDADE,
      instituicaoId: luzia.id,
      nome: 'Unidade Boa Viagem',
      cnes: '7654321',
    },
  });

  const chefiaLuziaId = await garantirCredencial('luzia@medescala.test');
  await prisma.usuario.upsert({
    where: { id: chefiaLuziaId },
    update: { nome: 'Dra. Luíza Prado' },
    create: { id: chefiaLuziaId, email: 'luzia@medescala.test', nome: 'Dra. Luíza Prado' },
  });
  for (const perfil of ['ADMIN_INSTITUICAO', 'CHEFIA_ESCALA'] as const) {
    const existe = await prisma.perfilAcesso.findFirst({
      where: { usuarioId: chefiaLuziaId, instituicaoId: luzia.id, perfil },
    });
    if (existe === null) {
      await prisma.perfilAcesso.create({
        data: { usuarioId: chefiaLuziaId, instituicaoId: luzia.id, perfil },
      });
    }
  }

  const setores = [
    {
      id: ESCOLA_PS_ID,
      unidadeId: unidadeEscola.id,
      nome: 'Pronto-Socorro',
      esp: 'Clínica Médica',
    },
    { id: ESCOLA_PED_ID, unidadeId: unidadeEscola.id, nome: 'Pediatria', esp: 'Pediatria' },
    {
      id: LUZIA_PS_ID,
      unidadeId: unidadeLuzia.id,
      nome: 'Emergência Adulto',
      esp: 'Clínica Médica',
    },
    {
      id: LUZIA_PED_ID,
      unidadeId: unidadeLuzia.id,
      nome: 'Emergência Pediátrica',
      esp: 'Pediatria',
    },
  ];
  for (const s of setores) {
    await prisma.setor.upsert({
      where: { id: s.id },
      update: { nome: s.nome },
      create: { id: s.id, unidadeId: s.unidadeId, nome: s.nome, especialidadeExigida: s.esp },
    });
  }

  // --- limpeza do que este arquivo criou antes -----------------------------------------

  const antigos = await prisma.plantao.findMany({
    where: { escala: { setorId: { in: SETORES_DOS_CENARIOS } } },
    select: { id: true, repasses: { select: { id: true } } },
  });
  await prisma.notificacao.deleteMany({
    where: { entidadeId: { in: antigos.flatMap((p) => [p.id, ...p.repasses.map((r) => r.id)]) } },
  });
  await prisma.plantao.deleteMany({ where: { escala: { setorId: { in: SETORES_DOS_CENARIOS } } } });
  await prisma.janelaDisponibilidade.deleteMany({
    where: { medicoId: { in: MEDICOS.map((m) => medico(m.email)) } },
  });

  // --- utilitários ----------------------------------------------------------------------

  function em(dias: number, hora: number, minuto = 0): Date {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    d.setHours(hora, minuto, 0, 0);
    return d;
  }
  const horas = (n: number): number => n * 3_600_000;

  async function escalaDe(setorId: string, inicio: Date): Promise<string> {
    const competencia = `${String(inicio.getUTCFullYear())}-${String(inicio.getUTCMonth() + 1).padStart(2, '0')}`;
    const e = await prisma.escala.upsert({
      where: { setorId_competencia: { setorId, competencia } },
      update: {},
      create: { setorId, competencia },
    });
    return e.id;
  }

  const setorPorId = new Map(setores.map((s) => [s.id, s]));
  const instDoSetor = (setorId: string) =>
    setorId === ESCOLA_PS_ID || setorId === ESCOLA_PED_ID ? escola : luzia;

  async function plantao(p: {
    setor: string;
    inicio: Date;
    horas?: number;
    valor?: number;
    status: StatusPlantao;
    titular?: string;
    executante?: string;
    extras?: Partial<Prisma.PlantaoUncheckedCreateInput>;
  }): Promise<{ id: string; inicio: Date; fim: Date; valor: number }> {
    const setor = setorPorId.get(p.setor);
    if (setor === undefined) throw new Error('setor desconhecido');
    const valor = p.valor ?? 140_000;
    const criado = await prisma.plantao.create({
      data: {
        escalaId: await escalaDe(p.setor, p.inicio),
        inicio: p.inicio,
        fim: new Date(p.inicio.getTime() + horas(p.horas ?? 12)),
        valorCentavos: valor,
        especialidadeExigida: setor.esp,
        requisitos: [],
        modeloContratacao: 'PJ',
        medicoTitularId: p.titular ?? p.executante ?? null,
        medicoExecutanteId: p.executante ?? null,
        status: p.status,
        ...p.extras,
      },
    });
    return { id: criado.id, inicio: criado.inicio, fim: criado.fim, valor };
  }

  async function parteMedico(
    medicoId: string,
    papel: Parte['papel'],
  ): Promise<Parte & { usuarioId: string }> {
    const m = await prisma.medico.findUniqueOrThrow({
      where: { id: medicoId },
      include: { usuario: true },
    });
    return {
      papel,
      nome: m.usuario.nome,
      registro: registroDeCrm(m.crm, m.crmUf),
      usuarioId: m.usuarioId,
    };
  }

  function dadosDoPlantao(
    p: { id: string; inicio: Date; fim: Date; valor: number },
    setorId: string,
  ) {
    const setor = setorPorId.get(setorId);
    const inst = instDoSetor(setorId);
    return {
      id: p.id,
      setor: setor?.nome ?? '',
      unidade:
        setorId === ESCOLA_PS_ID || setorId === ESCOLA_PED_ID
          ? unidadeEscola.nome
          : unidadeLuzia.nome,
      instituicao: inst.nome,
      inicio: p.inicio.toISOString(),
      fim: p.fim.toISOString(),
      valorCentavos: p.valor,
      especialidade: setor?.esp ?? '',
      modeloContratacao: 'PJ',
    };
  }

  /** Contrato emitido na escala; o médico assina se `aceiteDoMedico` vier. */
  async function contrato(
    p: { id: string; inicio: Date; fim: Date; valor: number },
    setorId: string,
    medicoId: string,
    aceiteDoMedico: { acao: string; em: Date } | null,
    substituidoEm: Date | null = null,
  ): Promise<void> {
    const inst = instDoSetor(setorId);
    const m = await parteMedico(medicoId, 'MEDICO');
    const parteInst: Parte = {
      papel: 'INSTITUICAO',
      nome: inst.nome,
      registro: registroDeCnpj(inst.cnpj),
    };
    const emitidoEm = new Date(p.inicio.getTime() - 7 * 86_400_000);
    const conteudo = montarContrato({
      plantao: dadosDoPlantao(p, setorId),
      medico: m,
      instituicao: parteInst,
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
        substituidoEm,
        assinaturas: {
          create: [
            {
              papel: 'INSTITUICAO',
              usuarioId: inst.id === escola.id ? chefiaEscola.id : chefiaLuziaId,
              nome: parteInst.nome,
              registro: parteInst.registro,
              acao: 'Escalou o médico',
              assinadaEm: emitidoEm,
              hashAssinado: hash,
            },
            ...(aceiteDoMedico === null
              ? []
              : [
                  {
                    papel: 'MEDICO' as const,
                    usuarioId: m.usuarioId,
                    nome: m.nome,
                    registro: m.registro,
                    acao: aceiteDoMedico.acao,
                    assinadaEm: aceiteDoMedico.em,
                    hashAssinado: hash,
                  },
                ]),
          ],
        },
      },
    });
  }

  /** Perna principal do pagamento, no estado pedido, com nota se já foi cumprido. */
  async function pagamento(
    p: { id: string; valor: number },
    setorId: string,
    beneficiario: string,
    status: 'PRE_AUTORIZADO' | 'RETIDO' | 'LIBERADO' | 'CANCELADO',
    datas: { retidoEm?: Date; liberavelEm?: Date; liberadoEm?: Date; emitidaEm?: Date } = {},
  ): Promise<void> {
    const inst = instDoSetor(setorId);
    const m = await prisma.medico.findUniqueOrThrow({
      where: { id: beneficiario },
      include: { usuario: true },
    });
    const r = calcularRetencoes({
      valorCentavos: p.valor,
      prestador: { modelo: 'PJ', regime: m.regimeTributario },
      tomadorOptanteDoSimples: false,
      issRetidoBp: inst.issRetidoBp,
      data: datas.retidoEm ?? new Date(),
    });
    const criado = await prisma.pagamento.create({
      data: {
        plantaoId: p.id,
        perna: 'PRINCIPAL',
        pagadorInstituicaoId: inst.id,
        beneficiarioMedicoId: beneficiario,
        valorBrutoCentavos: p.valor,
        retidoCentavos: r.retidoCentavos,
        liquidoCentavos: p.valor - r.retidoCentavos,
        referenciaGateway: `sim_seed_${p.id.slice(0, 8)}_${beneficiario.slice(0, 4)}`,
        status,
        retidoEm: datas.retidoEm ?? null,
        liberavelEm: datas.liberavelEm ?? null,
        liberadoEm: datas.liberadoEm ?? null,
        canceladoEm: status === 'CANCELADO' ? new Date() : null,
      },
    });
    if (status === 'RETIDO' || status === 'LIBERADO') {
      const emitida = status === 'LIBERADO';
      await prisma.documentoFiscal.create({
        data: {
          pagamentoId: criado.id,
          prestadorMedicoId: beneficiario,
          prestadorNome: m.usuario.nome,
          prestadorRegistro:
            m.cnpj === null ? registroDeCrm(m.crm, m.crmUf) : registroDeCnpj(m.cnpj),
          tomadorNome: inst.nome,
          tomadorRegistro: registroDeCnpj(inst.cnpj),
          discriminacao: `Serviço médico em ${setorPorId.get(setorId)?.esp ?? ''} — plantão de ${setorPorId.get(setorId)?.nome ?? ''}.`,
          valorServicoCentavos: p.valor,
          retencoes: r.linhas as unknown as Prisma.InputJsonValue,
          observacoes: r.observacoes,
          valorLiquidoCentavos: p.valor - r.retidoCentavos,
          ...(emitida
            ? {
                status: 'EMITIDA' as const,
                numero: `SIM-${String(new Date().getFullYear())}-${p.id.slice(0, 6).toUpperCase()}`,
                codigoVerificacao: p.id.slice(-8).toUpperCase(),
                emitidaEm: datas.emitidaEm ?? new Date(),
                emitidaPor: 'MEDICO' as const,
              }
            : {}),
        },
      });
    }
  }

  async function aviso(
    email: string,
    a: {
      tipo: Prisma.NotificacaoCreateManyInput['tipo'];
      titulo: string;
      corpo: string;
      link: string;
      entidadeId: string;
      ha: number;
    },
  ): Promise<void> {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { email } });
    await prisma.notificacao.create({
      data: {
        usuarioId: u.id,
        tipo: a.tipo,
        titulo: a.titulo,
        corpo: a.corpo,
        link: a.link,
        entidade: 'Plantao',
        entidadeId: a.entidadeId,
        criadaEm: new Date(Date.now() - a.ha * 60_000),
      },
    });
  }

  // ===================================================================================
  // Hospital Escola — o dia de hoje na escala da chefia
  // ===================================================================================

  // Em execução agora: Daniela fez check-in.
  const psHoje = await plantao({
    setor: ESCOLA_PS_ID,
    inicio: em(0, 7),
    status: 'EM_EXECUCAO',
    executante: medico('daniela@medescala.test'),
    extras: { checkinEm: em(0, 6, 52) },
  });
  await contrato(psHoje, ESCOLA_PS_ID, medico('daniela@medescala.test'), {
    acao: 'Fez check-in',
    em: em(0, 6, 52),
  });
  await pagamento(psHoje, ESCOLA_PS_ID, medico('daniela@medescala.test'), 'PRE_AUTORIZADO');

  // Noite de hoje descoberta, com duas candidaturas esperando a chefia.
  const psNoite = await plantao({
    setor: ESCOLA_PS_ID,
    inicio: em(0, 19),
    valor: 160_000,
    status: 'ABERTO',
  });
  for (const [email, minutos] of [
    ['eduardo@medescala.test', 180],
    ['helena@medescala.test', 95],
  ] as const) {
    await prisma.candidatura.create({
      data: {
        plantaoId: psNoite.id,
        medicoId: medico(email),
        criadaEm: new Date(Date.now() - minutos * 60_000),
      },
    });
  }
  await aviso('chefia@medescala.test', {
    tipo: 'CANDIDATURA_RECEBIDA',
    titulo: 'Nova candidatura',
    corpo: 'Helena Moura se candidatou para Pronto-Socorro · UPA Torrões, hoje às 19:00.',
    link: `/instituicao/${escola.id}/escala`,
    entidadeId: psNoite.id,
    ha: 95,
  });

  // Pediatria: dia coberto; noite com convite correndo para o Gustavo.
  const pedHoje = await plantao({
    setor: ESCOLA_PED_ID,
    inicio: em(0, 7),
    status: 'CONFIRMADO',
    executante: medico('fernanda@medescala.test'),
  });
  await contrato(pedHoje, ESCOLA_PED_ID, medico('fernanda@medescala.test'), {
    acao: 'Candidatou-se à vaga',
    em: em(-6, 10),
  });
  await pagamento(pedHoje, ESCOLA_PED_ID, medico('fernanda@medescala.test'), 'PRE_AUTORIZADO');

  const pedNoite = await plantao({
    setor: ESCOLA_PED_ID,
    inicio: em(0, 19),
    valor: 150_000,
    status: 'EM_SELECAO',
  });
  await prisma.convite.create({
    data: {
      plantaoId: pedNoite.id,
      medicoId: medico('gustavo@medescala.test'),
      ordem: 1,
      origem: 'INDICACAO',
      status: 'ATIVO',
      ativadoEm: new Date(Date.now() - 12 * 60_000),
      prazoAte: new Date(Date.now() + 48 * 60_000),
    },
  });

  // Amanhã cedo: vaga aberta compatível com a Ana (ela vê em Disponível).
  await plantao({ setor: ESCOLA_PS_ID, inicio: em(1, 7), valor: 150_000, status: 'ABERTO' });

  // Depois de amanhã: a chefia convidou a Ana direto para uma vaga.
  const conviteAna = await plantao({
    setor: ESCOLA_PS_ID,
    inicio: em(2, 7),
    valor: 155_000,
    status: 'EM_SELECAO',
  });
  await prisma.convite.create({
    data: {
      plantaoId: conviteAna.id,
      medicoId: ana.id,
      ordem: 1,
      origem: 'INDICACAO',
      status: 'ATIVO',
      ativadoEm: new Date(Date.now() - 6 * 60_000),
      prazoAte: new Date(Date.now() + 54 * 60_000),
    },
  });
  await aviso('medico@medescala.test', {
    tipo: 'CONVITE_RECEBIDO',
    titulo: 'Convite para uma vaga',
    corpo: 'Pronto-Socorro · UPA Torrões, depois de amanhã às 07:00. Responda em até 1 hora.',
    link: '/decisoes',
    entidadeId: conviteAna.id,
    ha: 6,
  });

  // Vagas de Pediatria nos próximos dias (a Ana só vê em "Todas").
  await plantao({ setor: ESCOLA_PED_ID, inicio: em(3, 7), status: 'ABERTO' });
  await plantao({ setor: ESCOLA_PED_ID, inicio: em(4, 19), valor: 165_000, status: 'ABERTO' });

  // Repasse do Eduardo, já aceito pela Helena, esperando a chefia (segunda aprovação).
  const eduardoPlantao = await plantao({
    setor: ESCOLA_PS_ID,
    inicio: em(3, 7),
    status: 'EM_REPASSE',
    executante: medico('eduardo@medescala.test'),
  });
  await contrato(eduardoPlantao, ESCOLA_PS_ID, medico('eduardo@medescala.test'), null);
  await pagamento(eduardoPlantao, ESCOLA_PS_ID, medico('eduardo@medescala.test'), 'PRE_AUTORIZADO');
  const repEduardo = await prisma.repasse.create({
    data: {
      plantaoId: eduardoPlantao.id,
      medicoTitularId: medico('eduardo@medescala.test'),
      medicoSubstitutoId: medico('helena@medescala.test'),
      motivo: 'Curso de atualização em emergência no mesmo dia.',
      status: 'AGUARDANDO_APROVACAO',
      criadoEm: new Date(Date.now() - horas(20)),
    },
  });
  await prisma.convite.create({
    data: {
      plantaoId: eduardoPlantao.id,
      repasseId: repEduardo.id,
      medicoId: medico('helena@medescala.test'),
      ordem: 1,
      origem: 'INDICACAO',
      status: 'ACEITO',
      ativadoEm: new Date(Date.now() - horas(20)),
      prazoAte: new Date(Date.now() - horas(19)),
      respondidoEm: new Date(Date.now() - horas(19.5)),
    },
  });
  await aviso('chefia@medescala.test', {
    tipo: 'APROVACAO_PENDENTE',
    titulo: 'Substituição aguardando aprovação',
    corpo: 'Eduardo Farias → Helena Moura, Pronto-Socorro · UPA Torrões.',
    link: `/instituicao/${escola.id}/decisoes`,
    entidadeId: repEduardo.id,
    ha: 1170,
  });

  // Repasse da Helena: a Ana é a convidada da vez.
  const helenaPlantao = await plantao({
    setor: ESCOLA_PS_ID,
    inicio: em(6, 7),
    status: 'EM_REPASSE',
    executante: medico('helena@medescala.test'),
  });
  await contrato(helenaPlantao, ESCOLA_PS_ID, medico('helena@medescala.test'), null);
  await pagamento(helenaPlantao, ESCOLA_PS_ID, medico('helena@medescala.test'), 'PRE_AUTORIZADO');
  const repHelena = await prisma.repasse.create({
    data: {
      plantaoId: helenaPlantao.id,
      medicoTitularId: medico('helena@medescala.test'),
      motivo: 'Consulta médica da família, sem possibilidade de remarcar.',
      criadoEm: new Date(Date.now() - 20 * 60_000),
    },
  });
  await prisma.convite.create({
    data: {
      plantaoId: helenaPlantao.id,
      repasseId: repHelena.id,
      medicoId: ana.id,
      ordem: 1,
      origem: 'INDICACAO',
      status: 'ATIVO',
      ativadoEm: new Date(Date.now() - 20 * 60_000),
      prazoAte: new Date(Date.now() + 40 * 60_000),
    },
  });
  await aviso('medico@medescala.test', {
    tipo: 'CONVITE_RECEBIDO',
    titulo: 'Convite para cobrir plantão',
    corpo: 'Helena Moura pediu repasse: Pronto-Socorro · UPA Torrões, em 6 dias às 07:00.',
    link: '/decisoes',
    entidadeId: repHelena.id,
    ha: 20,
  });

  // ===================================================================================
  // Histórico da Ana — o que já aconteceu
  // ===================================================================================

  // Há 10 dias: cumprido, nota emitida, pagamento liberado.
  const pago = await plantao({
    setor: ESCOLA_PS_ID,
    inicio: em(-10, 7),
    status: 'LIQUIDADO',
    executante: ana.id,
    extras: {
      checkinEm: em(-10, 6, 48),
      checkoutEm: em(-10, 19, 5),
      contestavelAte: em(-7, 19, 5),
    },
  });
  await contrato(pago, ESCOLA_PS_ID, ana.id, { acao: 'Fez check-in', em: em(-10, 6, 48) });
  await pagamento(pago, ESCOLA_PS_ID, ana.id, 'LIBERADO', {
    retidoEm: em(-10, 19, 5),
    liberavelEm: em(-7, 19, 5),
    liberadoEm: em(-7, 19, 6),
    emitidaEm: em(-9, 9, 30),
  });

  // Há 7 dias: a Ana repassou ao Bruno — aprovado, cumprido e pago a ele.
  const repassado = await plantao({
    setor: ESCOLA_PS_ID,
    inicio: em(-7, 7),
    status: 'LIQUIDADO',
    titular: ana.id,
    executante: bruno.id,
    extras: { checkinEm: em(-7, 6, 55), checkoutEm: em(-7, 19, 2), contestavelAte: em(-4, 19, 2) },
  });
  const aprovadoEm = em(-9, 14, 20);
  await contrato(
    repassado,
    ESCOLA_PS_ID,
    ana.id,
    { acao: 'Candidatou-se à vaga', em: em(-14, 9) },
    aprovadoEm,
  );
  const repAprovado = await prisma.repasse.create({
    data: {
      plantaoId: repassado.id,
      medicoTitularId: ana.id,
      medicoSubstitutoId: bruno.id,
      motivo: 'Banca de residência no mesmo horário.',
      status: 'APROVADO',
      aprovadoPorId: chefiaEscola.id,
      aprovadoEm,
      criadoEm: em(-10, 8),
    },
  });
  await prisma.convite.create({
    data: {
      plantaoId: repassado.id,
      repasseId: repAprovado.id,
      medicoId: bruno.id,
      ordem: 1,
      origem: 'INDICACAO',
      status: 'ACEITO',
      ativadoEm: em(-10, 8),
      prazoAte: em(-10, 9),
      respondidoEm: em(-10, 8, 25),
    },
  });
  {
    const titular = await parteMedico(ana.id, 'TITULAR');
    const substituto = await parteMedico(bruno.id, 'SUBSTITUTO');
    const parteInst: Parte = {
      papel: 'INSTITUICAO',
      nome: escola.nome,
      registro: registroDeCnpj(escola.cnpj),
    };
    const conteudo = montarSubstituicao({
      plantao: dadosDoPlantao(repassado, ESCOLA_PS_ID),
      titular,
      substituto,
      instituicao: parteInst,
      repasse: { id: repAprovado.id, motivo: repAprovado.motivo, modeloFiscal: 'A_RECONTRATACAO' },
      aprovadoEm,
      emitidoEm: aprovadoEm,
    });
    const hash = hashDe(conteudo);
    await prisma.termo.create({
      data: {
        tipo: 'SUBSTITUICAO',
        plantaoId: repassado.id,
        repasseId: repAprovado.id,
        conteudo: conteudo as unknown as Prisma.InputJsonValue,
        hash,
        emitidoEm: aprovadoEm,
        assinaturas: {
          create: [
            {
              papel: 'TITULAR',
              usuarioId: titular.usuarioId,
              nome: titular.nome,
              registro: titular.registro,
              acao: 'Pediu o repasse',
              assinadaEm: em(-10, 8),
              hashAssinado: hash,
            },
            {
              papel: 'SUBSTITUTO',
              usuarioId: substituto.usuarioId,
              nome: substituto.nome,
              registro: substituto.registro,
              acao: 'Aceitou o convite',
              assinadaEm: em(-10, 8, 25),
              hashAssinado: hash,
            },
            {
              papel: 'INSTITUICAO',
              usuarioId: chefiaEscola.id,
              nome: parteInst.nome,
              registro: parteInst.registro,
              acao: 'Aprovou a substituição',
              assinadaEm: aprovadoEm,
              hashAssinado: hash,
            },
          ],
        },
      },
    });
  }
  await pagamento(repassado, ESCOLA_PS_ID, ana.id, 'CANCELADO');
  await pagamento(repassado, ESCOLA_PS_ID, bruno.id, 'LIBERADO', {
    retidoEm: em(-7, 19, 2),
    liberavelEm: em(-4, 19, 2),
    liberadoEm: em(-4, 19, 3),
    emitidaEm: em(-4, 19, 3),
  });

  // Há 4 dias: contestado pela chefia, esperando a versão da Ana.
  const contestado = await plantao({
    setor: ESCOLA_PS_ID,
    inicio: em(-4, 7),
    status: 'CONTESTADO',
    executante: ana.id,
    extras: { checkinEm: em(-4, 7, 3), checkoutEm: em(-4, 16, 40), contestavelAte: em(-1, 16, 40) },
  });
  await contrato(contestado, ESCOLA_PS_ID, ana.id, { acao: 'Fez check-in', em: em(-4, 7, 3) });
  await prisma.contestacao.create({
    data: {
      plantaoId: contestado.id,
      justificativa:
        'Check-out às 16h40, antes do fim do plantão (19h). A passagem para o plantonista da noite não foi registrada.',
      abertaPorId: chefiaEscola.id,
      abertaEm: em(-3, 10, 15),
    },
  });
  await pagamento(contestado, ESCOLA_PS_ID, ana.id, 'RETIDO', {
    retidoEm: em(-4, 16, 40),
    liberavelEm: em(-1, 16, 40),
  });
  await aviso('medico@medescala.test', {
    tipo: 'PLANTAO_CONTESTADO',
    titulo: 'Plantão contestado',
    corpo:
      'Hospital Escola MedEscala contestou o plantão do Pronto-Socorro de 4 dias atrás. Você pode responder com a sua versão.',
    link: '/escala',
    entidadeId: contestado.id,
    ha: 60 * 24 * 3 - 600,
  });
  await aviso('medico@medescala.test', {
    tipo: 'PAGAMENTO_LIBERADO',
    titulo: 'Pagamento liberado',
    corpo: 'R$ 1.313,90 liberados para você (valor do plantão menos as retenções na fonte).',
    link: '/escala',
    entidadeId: pago.id,
    ha: 60 * 24 * 7,
  });

  // ===================================================================================
  // Hospital Santa Luzia — a Ana em outra instituição, e vagas por lá
  // ===================================================================================

  const anaLuzia = await plantao({
    setor: LUZIA_PS_ID,
    inicio: em(8, 19),
    valor: 180_000,
    status: 'CONFIRMADO',
    executante: ana.id,
  });
  await contrato(anaLuzia, LUZIA_PS_ID, ana.id, { acao: 'Aceitou o convite', em: em(-2, 15) });
  await pagamento(anaLuzia, LUZIA_PS_ID, ana.id, 'PRE_AUTORIZADO');

  await plantao({ setor: LUZIA_PS_ID, inicio: em(1, 19), valor: 170_000, status: 'ABERTO' });
  await plantao({ setor: LUZIA_PED_ID, inicio: em(2, 19), valor: 175_000, status: 'ABERTO' });

  const igorHoje = await plantao({
    setor: LUZIA_PS_ID,
    inicio: em(0, 7),
    status: 'CONFIRMADO',
    executante: medico('igor@medescala.test'),
  });
  await contrato(igorHoje, LUZIA_PS_ID, medico('igor@medescala.test'), null);
  await pagamento(igorHoje, LUZIA_PS_ID, medico('igor@medescala.test'), 'PRE_AUTORIZADO');

  // ===================================================================================
  // Disponibilidade — para a busca de candidatos e o matching terem quem mostrar
  // ===================================================================================

  const janelas: [string, number, number][] = [
    ['eduardo@medescala.test', 0, 14],
    ['helena@medescala.test', 1, 14],
    ['igor@medescala.test', 1, 10],
    ['gustavo@medescala.test', 0, 12],
    ['fernanda@medescala.test', 2, 14],
  ];
  for (const [email, de, ate] of janelas) {
    await prisma.janelaDisponibilidade.create({
      data: {
        medicoId: medico(email),
        inicio: em(de, 0),
        fim: em(ate, 23),
        valorMinimoCentavos: 120_000,
      },
    });
  }

  console.log(
    'cenários     2 hospitais · 8 médicos novos · vagas, candidaturas, convites, repasses, contestação e pagamentos',
  );
}
