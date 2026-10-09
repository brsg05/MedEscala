import { Injectable } from '@nestjs/common';
import type { Perfil, Prisma } from '@prisma/client';
import type {
  CandidatoResponse,
  PendenciasResponse,
  EstruturaResponse,
  PlantaoResponse,
  UsuarioAutenticado,
} from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  ForaDoEscopoDaInstituicaoError,
  InstituicaoNaoEncontradaError,
  InstituicaoPendenteError,
  SemAcessoAoRecursoError,
} from '../../shared/errors/dominio-negocio.error';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificacaoService } from '../notificacao/notificacao.service';
import { EscalaService, PLANTAO_COMPLETO } from './escala.service';

/** Instituições em que o usuário tem algum dos perfis pedidos (ADR-006). */
export function instituicoesComPerfil(
  usuario: UsuarioAutenticado,
  ...perfis: readonly Perfil[]
): readonly string[] {
  return usuario.perfis
    .filter((p) => perfis.includes(p.perfil))
    .map((p) => p.instituicaoId)
    .filter((id): id is string => id !== null);
}

/**
 * Leituras e travas do lado da instituição.
 *
 * Duas travas atravessam o módulo inteiro e moram aqui para não serem
 * reimplementadas — e esquecidas — em cada rota:
 *
 * - **papel**: o `PerfisGuard` responde "esta pessoa é chefia?"; só aqui se sabe
 *   "chefia DE QUAL instituição?" (segunda metade do ADR-006);
 * - **verificação**: instituição PENDENTE não publica vaga nem enxerga médicos
 *   (DEC-063), porque o cadastro é aberto (DEC-059).
 */
@Injectable()
export class InstituicaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escala: EscalaService,
    private readonly auditoria: AuditoriaService,
    private readonly notificacoes: NotificacaoService,
  ) {}

  /**
   * Prazos que o admin ajusta: cada convite da fila de substitutos (DEC-090) e a
   * contestação de um check-out (DEC-132). Cada mudança é um evento na trilha.
   */
  async configurar(
    instituicaoId: string,
    prazos: { prazoConviteRepasseMinutos?: number; prazoContestacaoHoras?: number },
    atorId: string,
  ): Promise<void> {
    const anterior = await this.prisma.instituicao.findUnique({
      where: { id: instituicaoId },
      select: { prazoConviteRepasseMinutos: true, prazoContestacaoHoras: true },
    });

    if (anterior === null) {
      throw new InstituicaoNaoEncontradaError();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.instituicao.update({ where: { id: instituicaoId }, data: prazos });

      if (prazos.prazoConviteRepasseMinutos !== undefined) {
        await this.auditoria.registrar(
          {
            acao: 'PRAZO_DE_CONVITE_ALTERADO',
            entidade: 'Instituicao',
            entidadeId: instituicaoId,
            atorId,
            estadoAnterior: String(anterior.prazoConviteRepasseMinutos),
            estadoNovo: String(prazos.prazoConviteRepasseMinutos),
          },
          tx,
        );
      }

      if (prazos.prazoContestacaoHoras !== undefined) {
        await this.auditoria.registrar(
          {
            acao: 'PRAZO_DE_CONTESTACAO_ALTERADO',
            entidade: 'Instituicao',
            entidadeId: instituicaoId,
            atorId,
            estadoAnterior: String(anterior.prazoContestacaoHoras),
            estadoNovo: String(prazos.prazoContestacaoHoras),
          },
          tx,
        );
      }
    });
  }

  /** DEC-063 — instituições esperando o operador confirmar o CNPJ. */
  async pendentes(): Promise<PendenciasResponse['instituicoes']> {
    const lista = await this.prisma.instituicao.findMany({
      where: { status: 'PENDENTE' },
      orderBy: { criadoEm: 'asc' },
    });

    return lista.map((i) => ({
      id: i.id,
      nome: i.nome,
      cnpj: i.cnpj,
      status: i.status,
      criadaEm: i.criadoEm.toISOString(),
    }));
  }

  async aprovar(instituicaoId: string, operadorId: string): Promise<void> {
    const inst = await this.prisma.instituicao.findUnique({ where: { id: instituicaoId } });

    if (inst === null) {
      throw new InstituicaoNaoEncontradaError();
    }

    if (inst.status === 'ATIVA') {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.instituicao.update({
        where: { id: instituicaoId },
        data: { status: 'ATIVA', verificadaEm: new Date(), verificadaPorId: operadorId },
      });

      await this.auditoria.registrar(
        {
          acao: 'INSTITUICAO_APROVADA',
          entidade: 'Instituicao',
          entidadeId: instituicaoId,
          atorId: operadorId,
          atorPerfil: 'OPERADOR_PLATAFORMA',
          estadoAnterior: 'PENDENTE',
          estadoNovo: 'ATIVA',
        },
        tx,
      );

      await this.notificacoes.notificar(tx, [{ adminsDe: instituicaoId }], {
        tipo: 'INSTITUICAO_APROVADA',
        titulo: 'Instituição aprovada',
        corpo: `A plataforma conferiu o CNPJ de ${inst.nome}. Já é possível publicar vagas e escalar médicos.`,
        link: `/instituicao/${instituicaoId}/escala`,
        entidade: 'Instituicao',
        entidadeId: instituicaoId,
      });
    });
  }

  exigirPapel(
    usuario: UsuarioAutenticado,
    instituicaoId: string,
    ...perfis: readonly Perfil[]
  ): void {
    if (!instituicoesComPerfil(usuario, ...perfis).includes(instituicaoId)) {
      throw new ForaDoEscopoDaInstituicaoError();
    }
  }

  async exigirAtiva(instituicaoId: string): Promise<void> {
    const inst = await this.prisma.instituicao.findUnique({
      where: { id: instituicaoId },
      select: { status: true },
    });

    if (inst === null) {
      throw new InstituicaoNaoEncontradaError();
    }

    if (inst.status !== 'ATIVA') {
      throw new InstituicaoPendenteError();
    }
  }

  async estrutura(instituicaoId: string): Promise<EstruturaResponse> {
    const inst = await this.prisma.instituicao.findUnique({
      where: { id: instituicaoId },
      include: {
        unidades: {
          orderBy: { nome: 'asc' },
          include: { setores: { orderBy: { nome: 'asc' } } },
        },
        perfis: {
          where: { perfil: 'CHEFIA_ESCALA', ativo: true },
          include: { usuario: { select: { id: true, nome: true, email: true } } },
        },
      },
    });

    if (inst === null) {
      throw new InstituicaoNaoEncontradaError();
    }

    return {
      instituicao: {
        id: inst.id,
        nome: inst.nome,
        cnpj: inst.cnpj,
        status: inst.status,
        prazoConviteRepasseMinutos: inst.prazoConviteRepasseMinutos,
        prazoContestacaoHoras: inst.prazoContestacaoHoras,
      },
      unidades: inst.unidades.map((u) => ({
        id: u.id,
        nome: u.nome,
        cnes: u.cnes,
        setores: u.setores.map((s) => ({
          id: s.id,
          nome: s.nome,
          especialidadeExigida: s.especialidadeExigida,
        })),
      })),
      chefias: inst.perfis
        .map((p) => ({ usuarioId: p.usuario.id, nome: p.usuario.nome, email: p.usuario.email }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    };
  }

  /** A unidade pertence à instituição em que o usuário é admin? */
  async exigirAdminDaUnidade(usuario: UsuarioAutenticado, unidadeId: string): Promise<void> {
    const unidade = await this.prisma.unidade.findUnique({
      where: { id: unidadeId },
      select: { instituicaoId: true },
    });

    // Unidade de outra instituição responde como inexistente: não confirma
    // a quem está sondando que o id existe.
    if (
      unidade === null ||
      !instituicoesComPerfil(usuario, 'ADMIN_INSTITUICAO').includes(unidade.instituicaoId)
    ) {
      throw new SemAcessoAoRecursoError();
    }
  }

  /** Plantões da instituição num intervalo — a "escala da unidade" da chefia. */
  async plantoes(instituicaoId: string, desde: Date, ate: Date): Promise<PlantaoResponse[]> {
    const plantoes = await this.prisma.plantao.findMany({
      where: {
        escala: { setor: { unidade: { instituicaoId } } },
        inicio: { lt: ate },
        fim: { gt: desde },
      },
      include: PLANTAO_COMPLETO,
      orderBy: { inicio: 'asc' },
    });

    return plantoes.map((p) => this.escala.paraResposta(p));
  }

  /**
   * DEC-062 — quem pode cobrir esta vaga.
   *
   * Só aparece o médico que ELE MESMO se ofereceu: declarou janela de
   * disponibilidade cobrindo o plantão inteiro, com valor mínimo atendido. Além
   * disso, verificado (RN02), da especialidade exigida e sem conflito de agenda
   * (RN03). Ordem alfabética: é o filtro da F08, sem a ordenação da F09, cuja
   * fórmula ainda não foi definida.
   *
   * O motivo de não listar todos os médicos é o cadastro aberto (DEC-059): uma
   * instituição falsa poderia colher nome e CRM da plataforma inteira.
   */
  async candidatos(plantaoId: string): Promise<CandidatoResponse[]> {
    const plantao = await this.escala.buscarPlantao(plantaoId);
    await this.exigirAtiva(plantao.escala.setor.unidade.instituicaoId);
    return this.elegiveis(plantao, []);
  }

  /**
   * Núcleo da DEC-062, reaproveitado pela lista da chefia, pela lista do titular
   * (DEC-087, Forma 1) e pelo matching (Forma 2): verificado, da especialidade,
   * com janela cobrindo o plantão inteiro e valor mínimo atendido, sem conflito de
   * agenda. Ordem alfabética — quem precisa de outra ordem (o matching) reordena.
   *
   * Aceita um cliente de transação para o matching ler e gravar convites no mesmo
   * instante lógico.
   */
  async elegiveis(
    plantao: {
      inicio: Date;
      fim: Date;
      valorCentavos: number;
      especialidadeExigida: string;
    },
    excluirMedicoIds: readonly string[],
    cliente: Prisma.TransactionClient = this.prisma,
  ): Promise<CandidatoResponse[]> {
    const medicos = await cliente.medico.findMany({
      where: {
        id: { notIn: [...excluirMedicoIds] },
        verificado: true,
        especialidade: plantao.especialidadeExigida,
        disponibilidades: {
          some: {
            inicio: { lte: plantao.inicio },
            fim: { gte: plantao.fim },
            OR: [
              { valorMinimoCentavos: null },
              { valorMinimoCentavos: { lte: plantao.valorCentavos } },
            ],
          },
        },
        plantoesExecutante: {
          none: {
            status: { not: 'CANCELADO' },
            inicio: { lt: plantao.fim },
            fim: { gt: plantao.inicio },
          },
        },
      },
      include: { usuario: { select: { nome: true } } },
      orderBy: { usuario: { nome: 'asc' } },
    });

    return medicos.map((m) => ({
      id: m.id,
      nome: m.usuario.nome,
      crm: m.crm,
      crmUf: m.crmUf,
      especialidade: m.especialidade,
    }));
  }

  /**
   * Quem pode LER um plantão e sua trilha: os médicos envolvidos (titular,
   * executante, substitutos de repasses) e admin ou chefia da instituição.
   *
   * Antes não havia trava nenhuma, o que era inofensivo enquanto todos os
   * usuários vinham do seed — e virou vazamento de nome e CRM com o cadastro
   * aberto.
   */
  async exigirLeituraDoPlantao(usuario: UsuarioAutenticado, plantaoId: string): Promise<void> {
    const plantao = await this.prisma.plantao.findUnique({
      where: { id: plantaoId },
      select: {
        medicoTitularId: true,
        medicoExecutanteId: true,
        escala: { select: { setor: { select: { unidade: { select: { instituicaoId: true } } } } } },
        repasses: { select: { medicoSubstitutoId: true } },
      },
    });

    if (plantao === null) {
      throw new SemAcessoAoRecursoError();
    }

    const instituicaoId = plantao.escala.setor.unidade.instituicaoId;

    if (
      instituicoesComPerfil(usuario, 'ADMIN_INSTITUICAO', 'CHEFIA_ESCALA').includes(instituicaoId)
    ) {
      return;
    }

    const medico = await this.prisma.medico.findUnique({
      where: { usuarioId: usuario.id },
      select: { id: true },
    });

    const envolvidos = new Set(
      [
        plantao.medicoTitularId,
        plantao.medicoExecutanteId,
        ...plantao.repasses.map((r) => r.medicoSubstitutoId),
      ].filter((id): id is string => id !== null),
    );

    if (medico === null || !envolvidos.has(medico.id)) {
      throw new SemAcessoAoRecursoError();
    }
  }
}
