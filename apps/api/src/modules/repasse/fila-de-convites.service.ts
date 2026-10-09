import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { OrigemConvite, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscalaService } from '../escala/escala.service';
import { InstituicaoService } from '../escala/instituicao.service';
import { IndicacaoInvalidaError } from '../../shared/errors/dominio-negocio.error';
import { ordenarParaConvite, TAMANHO_DO_LOTE } from './domain/ranking';

export const FILA_DE_CONVITES = 'convites';

export interface JobDeVencimento {
  repasseId: string;
}

type Tx = Prisma.TransactionClient;

interface PlantaoDaFila {
  id: string;
  inicio: Date;
  fim: Date;
  valorCentavos: number;
  especialidadeExigida: string;
  medicoExecutanteId: string | null;
  instituicaoId: string;
  prazoConviteMinutos: number;
}

/**
 * Fila de convites do repasse — DEC-087 a DEC-099.
 *
 * O substituto é encontrado de duas formas, as duas pela MESMA fila:
 *
 * - **Forma 1, indicação**: o titular escolhe até 5 pessoas, convidadas uma de
 *   cada vez, na ordem dada (DEC-089);
 * - **Forma 2, matching**: esgotada a fila (ou sem indicação nenhuma), o
 *   ranking provisório põe os 5 mais bem colocados na fila (DEC-093, DEC-094),
 *   lote após lote, até acabarem os candidatos (DEC-096).
 *
 * **Quem decide é o Postgres; o Redis acelera** (DEC-097). O prazo de cada
 * convite está na tabela. O job do BullMQ chama `avancar` na hora em que o prazo
 * vence, mas toda leitura também chama `varrerVencidos` — se o Redis perder o
 * job, a fila anda no próximo acesso em vez de travar com um convite eterno.
 */
@Injectable()
export class FilaDeConvitesService implements OnModuleInit {
  private readonly logger = new Logger(FilaDeConvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly escala: EscalaService,
    private readonly instituicao: InstituicaoService,
    @InjectQueue(FILA_DE_CONVITES) private readonly fila: Queue<JobDeVencimento>,
  ) {}

  onModuleInit(): void {
    // Sem ouvinte, um 'error' da conexão com o Redis derrubaria o processo. Com o
    // Redis fora, a api precisa continuar de pé: a fila anda pelas leituras.
    this.fila.on('error', (erro) => {
      this.logger.warn(`Redis indisponível para a fila de convites: ${erro.message}`);
    });
  }

  // --- validação e enfileiramento -------------------------------------------

  /**
   * Valida os indicados ANTES de qualquer escrita, para o pedido falhar inteiro
   * em vez de criar um repasse pela metade.
   *
   * Vale para a lista de quem se ofereceu e para o apontamento por CRM. Este
   * último não exige disponibilidade declarada (DEC-092), mas exige o resto:
   * CRM verificado e especialidade (RN02), e agenda livre (RN03).
   */
  async validarIndicados(
    plantao: { inicio: Date; fim: Date; especialidadeExigida: string },
    titularId: string,
    ids: readonly string[],
  ): Promise<void> {
    for (const id of ids) {
      if (id === titularId) {
        throw new IndicacaoInvalidaError(
          'Você não pode indicar a si mesmo para o seu próprio plantão',
        );
      }

      const medico = await this.prisma.medico.findUnique({
        where: { id },
        select: { verificado: true, especialidade: true, usuario: { select: { nome: true } } },
      });

      if (medico === null) {
        throw new IndicacaoInvalidaError('Um dos médicos indicados não foi encontrado');
      }
      if (!medico.verificado) {
        throw new IndicacaoInvalidaError(`${medico.usuario.nome} ainda não teve o CRM verificado`);
      }
      if (medico.especialidade !== plantao.especialidadeExigida) {
        throw new IndicacaoInvalidaError(
          `${medico.usuario.nome} não tem a especialidade exigida (${plantao.especialidadeExigida})`,
        );
      }

      await this.escala.exigirAgendaLivre(id, { inicio: plantao.inicio, fim: plantao.fim });
    }
  }

  /** Põe médicos no fim da fila, na ordem dada. */
  async enfileirar(
    tx: Tx,
    repasseId: string,
    medicoIds: readonly string[],
    origem: OrigemConvite,
  ): Promise<void> {
    if (medicoIds.length === 0) {
      return;
    }

    const { _max } = await tx.conviteRepasse.aggregate({
      where: { repasseId },
      _max: { ordem: true },
    });
    const base = _max.ordem ?? 0;

    await tx.conviteRepasse.createMany({
      data: medicoIds.map((medicoId, i) => ({ repasseId, medicoId, ordem: base + i + 1, origem })),
    });
  }

  // --- o motor da fila --------------------------------------------------------

  /**
   * Avança a fila de um repasse. Idempotente e seguro sob concorrência: o job do
   * Redis e uma leitura podem chamá-lo ao mesmo tempo — o `FOR UPDATE` serializa,
   * e o índice parcial `convite_um_ativo_por_repasse` impede dois convidados da
   * vez mesmo se algo escapar.
   */
  async avancar(repasseId: string, agora: Date = new Date()): Promise<void> {
    // Recipiente, e não `let`: o TypeScript não acompanha atribuições feitas
    // dentro do callback da transação e trataria a variável como sempre nula.
    const agendamento: { valor: { conviteId: string; prazoAte: Date } | null } = { valor: null };

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM repasse WHERE id = ${repasseId}::uuid FOR UPDATE`;

      const repasse = await tx.repasse.findUnique({ where: { id: repasseId } });

      // A fila só anda enquanto ninguém aceitou. Com aceite, o repasse está com a
      // chefia; se ela recusar, volta a SOLICITADO e a fila retoma (DEC-099).
      if (repasse === null || repasse.status !== 'SOLICITADO') {
        return;
      }

      const plantao = await this.plantaoDaFila(tx, repasse.plantaoId);

      // O plantão começou: não há mais o que repassar. O titular seguiu
      // responsável o tempo todo (RN01), e continua executante.
      if (agora >= plantao.inicio) {
        await this.encerrarPorInicioDoPlantao(tx, repasseId, plantao.id);
        return;
      }

      const ativo = await tx.conviteRepasse.findFirst({
        where: { repasseId, status: 'ATIVO' },
      });

      if (ativo !== null) {
        if (ativo.prazoAte !== null && ativo.prazoAte > agora) {
          return; // ainda é a vez dele
        }

        await tx.conviteRepasse.update({ where: { id: ativo.id }, data: { status: 'EXPIRADO' } });
        await this.auditoria.registrar(
          {
            acao: 'CONVITE_EXPIRADO',
            entidade: 'Repasse',
            entidadeId: repasseId,
            estadoAnterior: 'ATIVO',
            estadoNovo: 'EXPIRADO',
            payload: { medicoId: ativo.medicoId, ordem: ativo.ordem },
          },
          tx,
        );
      }

      let proximo = await this.proximoNaFila(tx, repasseId);

      // Fila vazia → convite aberto pelo matching (DEC-093), em lotes de 5 até
      // acabarem os candidatos (DEC-096). A marca `filaEsgotadaEm` impede rodar
      // o matching de novo a cada leitura depois que ele já não achou ninguém.
      if (proximo === null) {
        if (repasse.filaEsgotadaEm !== null) {
          return;
        }

        const entraram = await this.loteDoMatching(tx, repasseId, repasse.medicoTitularId, plantao);

        if (entraram === 0) {
          await tx.repasse.update({ where: { id: repasseId }, data: { filaEsgotadaEm: agora } });
          await this.auditoria.registrar(
            {
              acao: 'FILA_ESGOTADA',
              entidade: 'Repasse',
              entidadeId: repasseId,
              estadoNovo: 'SOLICITADO',
              payload: { motivo: 'sem mais candidatos; o repasse volta ao titular' },
            },
            tx,
          );
          return;
        }

        proximo = await this.proximoNaFila(tx, repasseId);
      }

      if (proximo === null) {
        return;
      }

      // O prazo nunca passa do início do plantão (DEC-090).
      const prazoAte = new Date(
        Math.min(agora.getTime() + plantao.prazoConviteMinutos * 60_000, plantao.inicio.getTime()),
      );

      await tx.conviteRepasse.update({
        where: { id: proximo.id },
        data: { status: 'ATIVO', ativadoEm: agora, prazoAte },
      });

      await this.auditoria.registrar(
        {
          acao: 'CONVITE_ENVIADO',
          entidade: 'Repasse',
          entidadeId: repasseId,
          estadoNovo: 'ATIVO',
          payload: { medicoId: proximo.medicoId, ordem: proximo.ordem, origem: proximo.origem },
        },
        tx,
      );

      agendamento.valor = { conviteId: proximo.id, prazoAte };
    });

    if (agendamento.valor !== null) {
      this.agendarVencimento(agendamento.valor.conviteId, repasseId, agendamento.valor.prazoAte);
    }
  }

  /**
   * DEC-097 — o que garante que a fila anda mesmo sem o Redis: toda leitura
   * relevante passa por aqui. O índice `(status, prazo_ate)` deixa a consulta
   * barata.
   */
  async varrerVencidos(agora: Date = new Date()): Promise<void> {
    const [vencidos, iniciados] = await Promise.all([
      this.prisma.conviteRepasse.findMany({
        where: { status: 'ATIVO', prazoAte: { lte: agora } },
        select: { repasseId: true },
        distinct: ['repasseId'],
      }),
      this.prisma.repasse.findMany({
        where: { status: 'SOLICITADO', plantao: { inicio: { lte: agora } } },
        select: { id: true },
      }),
    ]);

    const ids = new Set([...vencidos.map((v) => v.repasseId), ...iniciados.map((r) => r.id)]);

    for (const id of ids) {
      await this.avancar(id, agora);
    }
  }

  /** Remove o job de um convite que já foi respondido. */
  cancelarVencimento(conviteId: string): void {
    void this.fila.remove(this.idDoJob(conviteId)).catch((erro: unknown) => {
      this.logger.warn(`Não foi possível remover o job do convite ${conviteId}: ${String(erro)}`);
    });
  }

  // --- internos ---------------------------------------------------------------

  /**
   * Agenda o vencimento SEM esperar o Redis responder: com o Redis fora, o cliente
   * enfileira o comando e espera reconectar — um `await` aqui penduraria a
   * requisição HTTP. Falha de agendamento não é falha de negócio (DEC-097).
   */
  private agendarVencimento(conviteId: string, repasseId: string, prazoAte: Date): void {
    // Um segundo de folga: o job precisa encontrar o prazo JÁ vencido.
    const atraso = Math.max(prazoAte.getTime() - Date.now(), 0) + 1_000;

    void this.fila
      .add(
        'vencer-convite',
        { repasseId },
        {
          jobId: this.idDoJob(conviteId),
          delay: atraso,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      )
      .catch((erro: unknown) => {
        this.logger.warn(`Vencimento do convite ${conviteId} não agendado: ${String(erro)}`);
      });
  }

  private idDoJob(conviteId: string): string {
    return `convite-${conviteId}`;
  }

  private async proximoNaFila(tx: Tx, repasseId: string) {
    return tx.conviteRepasse.findFirst({
      where: { repasseId, status: 'NA_FILA' },
      orderBy: { ordem: 'asc' },
    });
  }

  private async plantaoDaFila(tx: Tx, plantaoId: string): Promise<PlantaoDaFila> {
    const p = await tx.plantao.findUniqueOrThrow({
      where: { id: plantaoId },
      include: {
        escala: {
          include: { setor: { include: { unidade: { include: { instituicao: true } } } } },
        },
      },
    });
    const instituicao = p.escala.setor.unidade.instituicao;

    return {
      id: p.id,
      inicio: p.inicio,
      fim: p.fim,
      valorCentavos: p.valorCentavos,
      especialidadeExigida: p.especialidadeExigida,
      medicoExecutanteId: p.medicoExecutanteId,
      instituicaoId: instituicao.id,
      prazoConviteMinutos: instituicao.prazoConviteRepasseMinutos,
    };
  }

  /**
   * Forma 2 — o próximo lote do matching. Devolve quantos entraram na fila.
   *
   * Elegíveis pela DEC-062, sem quem já foi convidado neste repasse, ordenados
   * pela fórmula provisória da DEC-094 — que não recebe valor nenhum.
   */
  private async loteDoMatching(
    tx: Tx,
    repasseId: string,
    titularId: string,
    plantao: PlantaoDaFila,
  ): Promise<number> {
    const jaConvidados = await tx.conviteRepasse.findMany({
      where: { repasseId },
      select: { medicoId: true },
    });

    const excluir = [
      titularId,
      ...(plantao.medicoExecutanteId === null ? [] : [plantao.medicoExecutanteId]),
      ...jaConvidados.map((c) => c.medicoId),
    ];

    const elegiveis = await this.instituicao.elegiveis(plantao, excluir, tx);

    if (elegiveis.length === 0) {
      return 0;
    }

    const ids = elegiveis.map((e) => e.id);

    const [vinculo, cumpridos] = await Promise.all([
      tx.plantao.groupBy({
        by: ['medicoExecutanteId'],
        where: {
          medicoExecutanteId: { in: ids },
          status: { not: 'CANCELADO' },
          escala: { setor: { unidade: { instituicaoId: plantao.instituicaoId } } },
        },
        _count: { _all: true },
      }),
      tx.plantao.groupBy({
        by: ['medicoExecutanteId'],
        where: { medicoExecutanteId: { in: ids }, status: { in: ['EXECUTADO', 'LIQUIDADO'] } },
        _count: { _all: true },
      }),
    ]);

    const contagem = (grupos: typeof vinculo, id: string): number =>
      grupos.find((g) => g.medicoExecutanteId === id)?._count._all ?? 0;

    const lote = ordenarParaConvite(
      elegiveis.map((e) => ({
        medicoId: e.id,
        nome: e.nome,
        vinculoComInstituicao: contagem(vinculo, e.id),
        plantoesCumpridos: contagem(cumpridos, e.id),
      })),
    ).slice(0, TAMANHO_DO_LOTE);

    await this.enfileirar(
      tx,
      repasseId,
      lote.map((c) => c.medicoId),
      'MATCHING',
    );

    await this.auditoria.registrar(
      {
        acao: 'MATCHING_LOTE',
        entidade: 'Repasse',
        entidadeId: repasseId,
        payload: { convidados: lote.map((c) => c.medicoId) },
      },
      tx,
    );

    return lote.length;
  }

  private async encerrarPorInicioDoPlantao(
    tx: Tx,
    repasseId: string,
    plantaoId: string,
  ): Promise<void> {
    await tx.conviteRepasse.updateMany({
      where: { repasseId, status: { in: ['NA_FILA', 'ATIVO'] } },
      data: { status: 'CANCELADO' },
    });
    await tx.repasse.update({ where: { id: repasseId }, data: { status: 'CANCELADO' } });
    await tx.plantao.update({ where: { id: plantaoId }, data: { status: 'CONFIRMADO' } });

    await this.auditoria.registrar(
      {
        acao: 'REPASSE_CANCELADO_INICIO_DO_PLANTAO',
        entidade: 'Repasse',
        entidadeId: repasseId,
        estadoAnterior: 'SOLICITADO',
        estadoNovo: 'CANCELADO',
      },
      tx,
    );
  }
}
