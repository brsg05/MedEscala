import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AgendaResponse,
  CriarPlantaoRequest,
  CriarSetorRequest,
  CriarUnidadeRequest,
  PlantaoResponse,
} from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  ForaDoEscopoDaInstituicaoError,
  InstituicaoPendenteError,
  PlantaoNaoEncontradoError,
  SetorNaoEncontradoError,
  SobreposicaoDeAgendaError,
} from '../../shared/errors/dominio-negocio.error';
import {
  LIMITE_HORAS_CONTIGUAS,
  encontrarSobreposicao,
  horasContiguasComOTurno,
} from './domain/agenda.rules';

/**
 * `include` para montar `PlantaoResponse` sem repetir a árvore. Exportado: quem
 * monta um plantão para resposta usa este, e não uma cópia que esquece um ramo.
 */
export const PLANTAO_COMPLETO = {
  escala: { include: { setor: { include: { unidade: { include: { instituicao: true } } } } } },
  titular: { include: { usuario: { select: { nome: true } } } },
  executante: { include: { usuario: { select: { nome: true } } } },
  contestacao: true,
  // F10 — só lidos quando a resposta leva `selecao` (escala da instituição).
  candidaturas: { where: { status: 'PENDENTE' }, select: { id: true } },
  convites: {
    where: { status: 'ATIVO', repasseId: null },
    include: { medico: { include: { usuario: { select: { nome: true } } } } },
  },
} as const;

/** DEC-131 — terminou e ninguém confirmou. Derivado do horário, não gravado. */
export function semConfirmacao(p: { status: string; fim: Date }, agora: Date): boolean {
  return (p.status === 'CONFIRMADO' || p.status === 'EM_EXECUCAO') && p.fim <= agora;
}

export type PlantaoCompleto = Prisma.PlantaoGetPayload<{ include: typeof PLANTAO_COMPLETO }>;

/**
 * F03, F05, F06 e F12 — unidades, setores, escala oficial e vagas.
 *
 * A escala é versionada por contador (`Escala.versao`), e o histórico completo é
 * a `evento_auditoria`, que já é append-only por trigger. Não há tabela paralela
 * de snapshots — um mecanismo só (ADR-021).
 */
@Injectable()
export class EscalaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async criarUnidade(
    instituicaoId: string,
    dados: CriarUnidadeRequest,
    atorId: string,
  ): Promise<{ id: string; nome: string }> {
    const unidade = await this.prisma.unidade.create({
      data: { instituicaoId, nome: dados.nome, cnes: dados.cnes },
    });

    await this.auditoria.registrar({
      acao: 'UNIDADE_CRIADA',
      entidade: 'Unidade',
      entidadeId: unidade.id,
      atorId,
      estadoNovo: 'ATIVA',
    });

    return { id: unidade.id, nome: unidade.nome };
  }

  async criarSetor(
    unidadeId: string,
    dados: CriarSetorRequest,
    atorId: string,
  ): Promise<{ id: string; nome: string }> {
    const setor = await this.prisma.setor.create({
      data: { unidadeId, nome: dados.nome, especialidadeExigida: dados.especialidadeExigida },
    });

    await this.auditoria.registrar({
      acao: 'SETOR_CRIADO',
      entidade: 'Setor',
      entidadeId: setor.id,
      atorId,
      estadoNovo: 'ATIVO',
    });

    return { id: setor.id, nome: setor.nome };
  }

  /**
   * F06 — publicar vaga de plantão.
   *
   * A vaga nasce ABERTA e sem executante. É o preenchimento que confirma o
   * plantão, e a partir daí a RN01 passa a valer sobre o campo `executante`.
   */
  async publicarVaga(
    dados: CriarPlantaoRequest,
    atorId: string,
    instituicoesDoAtor: readonly string[],
  ): Promise<PlantaoResponse> {
    const setor = await this.prisma.setor.findUnique({
      where: { id: dados.setorId },
      include: { unidade: { include: { instituicao: { select: { status: true } } } } },
    });

    if (setor === null) {
      throw new SetorNaoEncontradoError();
    }

    if (!instituicoesDoAtor.includes(setor.unidade.instituicaoId)) {
      throw new ForaDoEscopoDaInstituicaoError();
    }

    // DEC-063: com cadastro aberto, instituição não verificada não publica vaga.
    if (setor.unidade.instituicao.status !== 'ATIVA') {
      throw new InstituicaoPendenteError();
    }

    const inicio = new Date(dados.inicio);
    const escala = await this.escalaDaCompetencia(setor.id, inicio);

    const plantao = await this.prisma.plantao.create({
      data: {
        escalaId: escala.id,
        inicio,
        fim: new Date(dados.fim),
        valorCentavos: dados.valorCentavos,
        especialidadeExigida: dados.especialidadeExigida,
        requisitos: dados.requisitos,
        modeloContratacao: dados.modeloContratacao,
      },
      include: PLANTAO_COMPLETO,
    });

    await this.auditoria.registrar({
      acao: 'VAGA_PUBLICADA',
      entidade: 'Plantao',
      entidadeId: plantao.id,
      atorId,
      estadoNovo: 'ABERTO',
      payload: { setorId: setor.id, valorCentavos: dados.valorCentavos },
    });

    return this.paraResposta(plantao);
  }

  /**
   * F05 — agenda unificada do médico.
   *
   * Devolve junto o alerta de carga horária: a RN03 manda avisar quando a soma
   * de plantões contíguos passa de 24h, mas não bloquear — bloquear seria
   * definir jornada, o que a RN09 proíbe.
   */
  async agendaDoMedico(medicoId: string, desde: Date, ate: Date): Promise<AgendaResponse> {
    const plantoes = await this.prisma.plantao.findMany({
      where: {
        medicoExecutanteId: medicoId,
        status: { not: 'CANCELADO' },
        inicio: { gte: desde, lt: ate },
      },
      include: PLANTAO_COMPLETO,
      orderBy: { inicio: 'asc' },
    });

    const turnos = plantoes.map((p) => ({ inicio: p.inicio, fim: p.fim }));
    const horas =
      turnos.length === 0 ? 0 : Math.max(...turnos.map((t) => horasContiguasComOTurno(t, turnos)));

    return {
      plantoes: plantoes.map((p) => this.paraResposta(p)),
      alertaCargaHoraria:
        horas > LIMITE_HORAS_CONTIGUAS
          ? { horasContiguas: horas, limite: LIMITE_HORAS_CONTIGUAS }
          : null,
    };
  }

  async buscarPlantao(id: string): Promise<PlantaoCompleto> {
    const plantao = await this.prisma.plantao.findUnique({
      where: { id },
      include: PLANTAO_COMPLETO,
    });

    if (plantao === null) {
      throw new PlantaoNaoEncontradoError();
    }

    return plantao;
  }

  /**
   * RN03 — recusa em linguagem de domínio antes de a exclusion constraint do
   * banco recusar em linguagem de Postgres.
   *
   * A verificação aqui NÃO substitui a do banco: entre esta consulta e o INSERT
   * cabe outra transação. A constraint é a garantia; isto é a mensagem legível.
   */
  async exigirAgendaLivre(medicoId: string, turno: { inicio: Date; fim: Date }): Promise<void> {
    const ocupados = await this.prisma.plantao.findMany({
      where: {
        medicoExecutanteId: medicoId,
        status: { not: 'CANCELADO' },
        // Recorte grosseiro por data, para não carregar a agenda inteira; a
        // decisão fina de sobreposição é da função pura.
        inicio: { lt: turno.fim },
        fim: { gt: turno.inicio },
      },
      select: { id: true, inicio: true, fim: true },
    });

    const conflito = encontrarSobreposicao(turno, ocupados);

    if (conflito !== null) {
      throw new SobreposicaoDeAgendaError(conflito.id);
    }
  }

  /** F12 — a escala da competência, criada sob demanda. */
  private async escalaDaCompetencia(setorId: string, inicio: Date): Promise<{ id: string }> {
    const competencia = `${String(inicio.getUTCFullYear())}-${String(inicio.getUTCMonth() + 1).padStart(2, '0')}`;

    return this.prisma.escala.upsert({
      where: { setorId_competencia: { setorId, competencia } },
      update: {},
      create: { setorId, competencia },
      select: { id: true },
    });
  }

  /**
   * `comSelecao` só na escala da instituição: o médico não vê quem mais foi
   * convidado para uma vaga, nem quantos se candidataram (DEC-108).
   */
  paraResposta(p: PlantaoCompleto, opcoes: { comSelecao?: boolean } = {}): PlantaoResponse {
    const setor = p.escala.setor;
    const daVez = p.convites[0] ?? null;

    return {
      id: p.id,
      inicio: p.inicio.toISOString(),
      fim: p.fim.toISOString(),
      valorCentavos: p.valorCentavos,
      especialidadeExigida: p.especialidadeExigida,
      requisitos: p.requisitos,
      modeloContratacao: p.modeloContratacao,
      status: p.status,
      setor: {
        id: setor.id,
        nome: setor.nome,
        unidade: setor.unidade.nome,
        instituicao: setor.unidade.instituicao.nome,
      },
      titular:
        p.titular === null
          ? null
          : {
              id: p.titular.id,
              nome: p.titular.usuario.nome,
              crm: p.titular.crm,
              crmUf: p.titular.crmUf,
            },
      executante:
        p.executante === null
          ? null
          : {
              id: p.executante.id,
              nome: p.executante.usuario.nome,
              crm: p.executante.crm,
              crmUf: p.executante.crmUf,
            },
      execucao: {
        checkinEm: p.checkinEm?.toISOString() ?? null,
        checkoutEm: p.checkoutEm?.toISOString() ?? null,
        contestavelAte: p.contestavelAte?.toISOString() ?? null,
        semConfirmacao: semConfirmacao(p, new Date()),
        contestacao:
          p.contestacao === null
            ? null
            : {
                justificativa: p.contestacao.justificativa,
                abertaEm: p.contestacao.abertaEm.toISOString(),
                resposta: p.contestacao.resposta,
                respondidaEm: p.contestacao.respondidaEm?.toISOString() ?? null,
                resultado: p.contestacao.resultado,
                nota: p.contestacao.nota,
                resolvidaEm: p.contestacao.resolvidaEm?.toISOString() ?? null,
              },
      },
      selecao:
        opcoes.comSelecao === true && (p.status === 'ABERTO' || p.status === 'EM_SELECAO')
          ? {
              candidaturasPendentes: p.candidaturas.length,
              convidadoDaVez:
                daVez === null
                  ? null
                  : {
                      id: daVez.medico.id,
                      nome: daVez.medico.usuario.nome,
                      crm: daVez.medico.crm,
                      crmUf: daVez.medico.crmUf,
                    },
              prazoConviteAte: daVez?.prazoAte?.toISOString() ?? null,
            }
          : null,
    };
  }
}
