import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { OrigemConvite, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { formatarHora } from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscalaService } from '../escala/escala.service';
import { InstituicaoService } from '../escala/instituicao.service';
import { NotificacaoService } from '../notificacao/notificacao.service';
import { descreverPlantao } from '../notificacao/textos';
import { IndicacaoInvalidaError } from '../../shared/errors/dominio-negocio.error';
import {
  JANELA_DA_TAXA_DE_RESPOSTA_DIAS,
  ordenarParaConvite,
  TAMANHO_DO_LOTE,
  taxaDeResposta,
} from './domain/ranking';

export const FILA_DE_CONVITES = 'convites';

/**
 * Dado do job de vencimento. Um dos dois: a fila de um repasse ou a de uma
 * vaga. Jobs antigos, de antes da DEC-164, só têm `repasseId` — continuam valendo.
 */
export interface JobDeVencimento {
  repasseId?: string;
  plantaoId?: string;
}

/** Identifica uma fila: (plantão, repasse); na fila da vaga, o repasse é nulo. */
export interface Fila {
  plantaoId: string;
  repasseId: string | null;
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
  /** Onde e quando, para o texto dos avisos (F22). */
  descricao: string;
}

interface Contexto {
  fila: Fila;
  plantao: PlantaoDaFila;
  /** Quem não entra no matching, além dos já convidados. */
  excluir: string[];
}

type Trilha = { entidade: string; entidadeId: string };

/** O que muda entre a fila do repasse e a da vaga; o resto do motor é comum. */
interface FilaAberta {
  contexto: Contexto;
  esgotada: boolean;
  aoComecar: () => Promise<void>;
  aoExpirar: (medicoId: string) => Promise<void>;
  aoEsgotar: () => Promise<void>;
  textoDoConvite: (prazoAte: Date) => { titulo: string; corpo: string } & Trilha;
  trilha: Trilha;
}

/**
 * Fila de convites — DEC-087 a DEC-099, generalizada pela DEC-164.
 *
 * Uma fila serve para encontrar quem cubra um plantão, e há duas:
 *
 * - a do **repasse** — o titular indica até 5 (Forma 1); esgotada, o matching
 *   chama em lotes (Forma 2); ninguém aceitando, volta ao titular (DEC-096);
 * - a da **vaga aberta** (F10, DEC-135) — a chefia indica, ou deixa o matching
 *   chamar; o aceite confirma direto, sem terceira assinatura: quem convidou foi
 *   a própria instituição. Esgotada, a vaga volta a ABERTO.
 *
 * O motor é um só: prazo por convite, um convidado da vez por plantão (índice
 * `convite_um_ativo_por_plantao`), job no Redis e varredura nas leituras.
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
    private readonly notificacoes: NotificacaoService,
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
   * em vez de criar uma fila pela metade.
   *
   * Vale para a lista de quem se ofereceu e para o apontamento por CRM. Este
   * último não exige disponibilidade declarada (DEC-092), mas exige o resto:
   * CRM verificado e especialidade (RN02), e agenda livre (RN03). `titularId` é
   * nulo na fila da vaga, que não tem titular.
   */
  async validarIndicados(
    plantao: { inicio: Date; fim: Date; especialidadeExigida: string },
    titularId: string | null,
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

  /** Põe médicos no fim da fila, na ordem dada. Quem já está nela é ignorado. */
  async enfileirar(
    tx: Tx,
    fila: Fila,
    medicoIds: readonly string[],
    origem: OrigemConvite,
  ): Promise<void> {
    if (medicoIds.length === 0) {
      return;
    }

    const existentes = await tx.convite.findMany({
      where: { plantaoId: fila.plantaoId, repasseId: fila.repasseId },
      select: { medicoId: true, ordem: true },
    });
    const novos = medicoIds.filter((id) => !existentes.some((c) => c.medicoId === id));
    const base = Math.max(0, ...existentes.map((c) => c.ordem));

    await tx.convite.createMany({
      data: novos.map((medicoId, i) => ({
        plantaoId: fila.plantaoId,
        repasseId: fila.repasseId,
        medicoId,
        ordem: base + i + 1,
        origem,
      })),
    });
  }

  // --- o motor da fila --------------------------------------------------------

  /**
   * Avança a fila de um repasse. Idempotente e seguro sob concorrência: o job do
   * Redis e uma leitura podem chamá-lo ao mesmo tempo — o `FOR UPDATE` serializa,
   * e o índice parcial `convite_um_ativo_por_plantao` impede dois convidados da
   * vez mesmo se algo escapar.
   */
  async avancar(repasseId: string, agora: Date = new Date()): Promise<void> {
    await this.avancarFila(agora, async (tx) => {
      await tx.$queryRaw`SELECT id FROM repasse WHERE id = ${repasseId}::uuid FOR UPDATE`;
      const repasse = await tx.repasse.findUnique({ where: { id: repasseId } });

      // A fila só anda enquanto ninguém aceitou. Com aceite, o repasse está com a
      // chefia; se ela recusar, volta a SOLICITADO e a fila retoma (DEC-099).
      if (repasse === null || repasse.status !== 'SOLICITADO') {
        return null;
      }

      const plantao = await this.plantaoDaFila(tx, repasse.plantaoId);
      const fila: Fila = { plantaoId: plantao.id, repasseId };
      const titular = [{ medicoId: repasse.medicoTitularId }];
      const trilha: Trilha = { entidade: 'Repasse', entidadeId: repasseId };

      return {
        contexto: {
          fila,
          plantao,
          excluir: [
            repasse.medicoTitularId,
            ...(plantao.medicoExecutanteId === null ? [] : [plantao.medicoExecutanteId]),
          ],
        },
        // A marca impede rodar o matching de novo a cada leitura depois que ele
        // já não achou ninguém (DEC-096).
        esgotada: repasse.filaEsgotadaEm !== null,
        trilha,

        // O plantão começou: não há mais o que repassar. O titular seguiu
        // responsável o tempo todo (RN01), e continua executante (DEC-104).
        aoComecar: async () => {
          await this.cancelarConvites(tx, fila);
          await tx.repasse.update({ where: { id: repasseId }, data: { status: 'CANCELADO' } });
          await tx.plantao.update({ where: { id: plantao.id }, data: { status: 'CONFIRMADO' } });
          await this.auditoria.registrar(
            {
              acao: 'REPASSE_CANCELADO_INICIO_DO_PLANTAO',
              ...trilha,
              estadoAnterior: 'SOLICITADO',
              estadoNovo: 'CANCELADO',
            },
            tx,
          );
          await this.notificacoes.notificar(tx, titular, {
            tipo: 'REPASSE_CANCELADO',
            titulo: 'Repasse encerrado sem substituto',
            corpo: `O plantão ${plantao.descricao} começou sem substituto aprovado. Você segue como executante.`,
            link: '/escala',
            ...trilha,
          });
        },

        aoExpirar: async (medicoId) => {
          await this.notificacoes.notificar(tx, titular, {
            tipo: 'CONVITE_EXPIRADO',
            titulo: 'Convite expirou',
            corpo: `${await this.nomeDoMedico(tx, medicoId)} não respondeu a tempo ao convite para ${plantao.descricao}.`,
            link: '/repasses',
            ...trilha,
          });
        },

        aoEsgotar: async () => {
          await tx.repasse.update({ where: { id: repasseId }, data: { filaEsgotadaEm: agora } });
          await this.auditoria.registrar(
            {
              acao: 'FILA_ESGOTADA',
              ...trilha,
              estadoNovo: 'SOLICITADO',
              payload: { motivo: 'sem mais candidatos; o repasse volta ao titular' },
            },
            tx,
          );
          await this.notificacoes.notificar(tx, titular, {
            tipo: 'FILA_ESGOTADA',
            titulo: 'Ninguém aceitou o repasse',
            corpo: `A fila de convites para ${plantao.descricao} acabou sem aceite. Indique outras pessoas ou cancele o pedido — o plantão continua seu.`,
            link: '/repasses',
            ...trilha,
          });
        },

        textoDoConvite: (prazoAte) => ({
          titulo: 'Convite para cobrir plantão',
          corpo: `${plantao.descricao}. Responda até ${formatarHora(prazoAte)}.`,
          ...trilha,
        }),
      };
    });
  }

  /**
   * Avança a fila de uma vaga aberta (F10, DEC-135). A fila só corre com a vaga
   * EM_SELECAO; esgotada, ou começado o plantão, a vaga volta a ABERTO.
   */
  async avancarVaga(plantaoId: string, agora: Date = new Date()): Promise<void> {
    await this.avancarFila(agora, async (tx) => {
      await tx.$queryRaw`SELECT id FROM plantao WHERE id = ${plantaoId}::uuid FOR UPDATE`;
      const atual = await tx.plantao.findUnique({
        where: { id: plantaoId },
        select: { status: true },
      });

      if (atual === null || atual.status !== 'EM_SELECAO') {
        return null;
      }

      const plantao = await this.plantaoDaFila(tx, plantaoId);
      const fila: Fila = { plantaoId, repasseId: null };
      const trilha: Trilha = { entidade: 'Plantao', entidadeId: plantaoId };

      const voltarAAberto = async (motivo: string): Promise<void> => {
        await this.cancelarConvites(tx, fila);
        await tx.plantao.update({ where: { id: plantaoId }, data: { status: 'ABERTO' } });
        await this.auditoria.registrar(
          {
            acao: 'FILA_DA_VAGA_ENCERRADA',
            ...trilha,
            estadoAnterior: 'EM_SELECAO',
            estadoNovo: 'ABERTO',
            payload: { motivo },
          },
          tx,
        );
      };

      return {
        contexto: { fila, plantao, excluir: [] },
        // Na vaga, a marca de esgotada é o próprio status: esgotada, ela volta a
        // ABERTO, e a fila não corre fora de EM_SELECAO.
        esgotada: false,
        trilha,

        aoComecar: async () => {
          await voltarAAberto('o plantão começou sem aceite');
        },

        // Expiração de convite de vaga não avisa a chefia um a um: seria ruído
        // para quem cuida da escala inteira. Ela é avisada no fim (DEC-169).
        aoExpirar: async () => undefined,

        aoEsgotar: async () => {
          await voltarAAberto('sem mais candidatos');
          await this.notificacoes.notificar(tx, [{ chefiasDe: plantao.instituicaoId }], {
            tipo: 'FILA_ESGOTADA',
            titulo: 'Ninguém aceitou a vaga',
            corpo: `Os convites para ${plantao.descricao} acabaram sem aceite. A vaga voltou a ficar aberta.`,
            link: `/instituicao/${plantao.instituicaoId}/escala`,
            ...trilha,
          });
        },

        textoDoConvite: (prazoAte) => ({
          titulo: 'Convite para uma vaga',
          corpo: `${plantao.descricao}. Responda até ${formatarHora(prazoAte)}.`,
          ...trilha,
        }),
      };
    });
  }

  /**
   * DEC-097 — o que garante que a fila anda mesmo sem o Redis: toda leitura
   * relevante passa por aqui. O índice `(status, prazo_ate)` deixa a consulta
   * barata.
   */
  async varrerVencidos(agora: Date = new Date()): Promise<void> {
    const [vencidos, repassesIniciados, vagasIniciadas] = await Promise.all([
      this.prisma.convite.findMany({
        where: { status: 'ATIVO', prazoAte: { lte: agora } },
        select: { plantaoId: true, repasseId: true },
      }),
      this.prisma.repasse.findMany({
        where: { status: 'SOLICITADO', plantao: { inicio: { lte: agora } } },
        select: { id: true },
      }),
      this.prisma.plantao.findMany({
        where: { status: 'EM_SELECAO', inicio: { lte: agora } },
        select: { id: true },
      }),
    ]);

    const repasses = new Set([
      ...vencidos.flatMap((v) => (v.repasseId === null ? [] : [v.repasseId])),
      ...repassesIniciados.map((r) => r.id),
    ]);
    const vagas = new Set([
      ...vencidos.flatMap((v) => (v.repasseId === null ? [v.plantaoId] : [])),
      ...vagasIniciadas.map((p) => p.id),
    ]);

    for (const id of repasses) {
      await this.avancar(id, agora);
    }
    for (const id of vagas) {
      await this.avancarVaga(id, agora);
    }
  }

  /**
   * Encerra a fila: quem esperava não será chamado, e quem tinha o convite na
   * mão perde a vez. Devolve os convidados da vez, para quem chamou avisá-los e
   * cancelar o job.
   */
  async cancelarConvites(tx: Tx, fila: Fila): Promise<{ id: string; medicoId: string }[]> {
    const ativos = await tx.convite.findMany({
      where: { plantaoId: fila.plantaoId, repasseId: fila.repasseId, status: 'ATIVO' },
      select: { id: true, medicoId: true },
    });
    await tx.convite.updateMany({
      where: {
        plantaoId: fila.plantaoId,
        repasseId: fila.repasseId,
        status: { in: ['NA_FILA', 'ATIVO'] },
      },
      data: { status: 'CANCELADO' },
    });
    return ativos;
  }

  /** Remove o job de um convite que já foi respondido. */
  cancelarVencimento(conviteId: string): void {
    void this.fila.remove(this.idDoJob(conviteId)).catch((erro: unknown) => {
      this.logger.warn(`Não foi possível remover o job do convite ${conviteId}: ${String(erro)}`);
    });
  }

  // --- internos ---------------------------------------------------------------

  /**
   * O motor comum. `abrir` trava e lê a fila (repasse ou vaga) e devolve o que
   * muda entre as duas; `null` quer dizer "esta fila não está correndo".
   */
  private async avancarFila(
    agora: Date,
    abrir: (tx: Tx) => Promise<FilaAberta | null>,
  ): Promise<void> {
    // Recipiente, e não `let`: o TypeScript não acompanha atribuições feitas
    // dentro do callback da transação e trataria a variável como sempre nula.
    const agendamento: {
      valor: { conviteId: string; prazoAte: Date; job: JobDeVencimento } | null;
    } = { valor: null };

    await this.prisma.$transaction(async (tx) => {
      const aberta = await abrir(tx);
      if (aberta === null) {
        return;
      }

      const { contexto, trilha } = aberta;
      const { fila, plantao } = contexto;

      if (agora >= plantao.inicio) {
        await aberta.aoComecar();
        return;
      }

      const ativo = await tx.convite.findFirst({
        where: { plantaoId: fila.plantaoId, repasseId: fila.repasseId, status: 'ATIVO' },
      });

      if (ativo !== null) {
        if (ativo.prazoAte !== null && ativo.prazoAte > agora) {
          return; // ainda é a vez dele
        }

        await tx.convite.update({ where: { id: ativo.id }, data: { status: 'EXPIRADO' } });
        await this.auditoria.registrar(
          {
            acao: 'CONVITE_EXPIRADO',
            ...trilha,
            estadoAnterior: 'ATIVO',
            estadoNovo: 'EXPIRADO',
            payload: { medicoId: ativo.medicoId, ordem: ativo.ordem },
          },
          tx,
        );
        await aberta.aoExpirar(ativo.medicoId);
      }

      let proximo = await this.proximoNaFila(tx, fila);

      // Fila vazia → o matching chama (DEC-093), em lotes de 5 até acabarem os
      // candidatos (DEC-096).
      if (proximo === null) {
        if (aberta.esgotada) {
          return;
        }

        const entraram = await this.loteDoMatching(tx, contexto, trilha);

        if (entraram === 0) {
          await aberta.aoEsgotar();
          return;
        }

        proximo = await this.proximoNaFila(tx, fila);
      }

      if (proximo === null) {
        return;
      }

      // O prazo nunca passa do início do plantão (DEC-090).
      const prazoAte = new Date(
        Math.min(agora.getTime() + plantao.prazoConviteMinutos * 60_000, plantao.inicio.getTime()),
      );

      await tx.convite.update({
        where: { id: proximo.id },
        data: { status: 'ATIVO', ativadoEm: agora, prazoAte },
      });

      await this.auditoria.registrar(
        {
          acao: 'CONVITE_ENVIADO',
          ...trilha,
          estadoNovo: 'ATIVO',
          payload: { medicoId: proximo.medicoId, ordem: proximo.ordem, origem: proximo.origem },
        },
        tx,
      );

      await this.notificacoes.notificar(tx, [{ medicoId: proximo.medicoId }], {
        tipo: 'CONVITE_RECEBIDO',
        ...aberta.textoDoConvite(prazoAte),
        link: '/decisoes',
      });

      agendamento.valor = {
        conviteId: proximo.id,
        prazoAte,
        job:
          fila.repasseId === null ? { plantaoId: fila.plantaoId } : { repasseId: fila.repasseId },
      };
    });

    if (agendamento.valor !== null) {
      this.agendarVencimento(
        agendamento.valor.conviteId,
        agendamento.valor.job,
        agendamento.valor.prazoAte,
      );
    }
  }

  /**
   * Agenda o vencimento SEM esperar o Redis responder: com o Redis fora, o cliente
   * enfileira o comando e espera reconectar — um `await` aqui penduraria a
   * requisição HTTP. Falha de agendamento não é falha de negócio (DEC-097).
   */
  private agendarVencimento(conviteId: string, job: JobDeVencimento, prazoAte: Date): void {
    // Um segundo de folga: o job precisa encontrar o prazo JÁ vencido.
    const atraso = Math.max(prazoAte.getTime() - Date.now(), 0) + 1_000;

    void this.fila
      .add('vencer-convite', job, {
        jobId: this.idDoJob(conviteId),
        delay: atraso,
        removeOnComplete: true,
        removeOnFail: 100,
      })
      .catch((erro: unknown) => {
        this.logger.warn(`Vencimento do convite ${conviteId} não agendado: ${String(erro)}`);
      });
  }

  private idDoJob(conviteId: string): string {
    return `convite-${conviteId}`;
  }

  private async proximoNaFila(tx: Tx, fila: Fila) {
    return tx.convite.findFirst({
      where: { plantaoId: fila.plantaoId, repasseId: fila.repasseId, status: 'NA_FILA' },
      orderBy: { ordem: 'asc' },
    });
  }

  private async nomeDoMedico(tx: Tx, medicoId: string): Promise<string> {
    const m = await tx.medico.findUniqueOrThrow({
      where: { id: medicoId },
      select: { usuario: { select: { nome: true } } },
    });
    return m.usuario.nome;
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
      descricao: descreverPlantao({
        setor: p.escala.setor.nome,
        unidade: p.escala.setor.unidade.nome,
        inicio: p.inicio,
      }),
      id: p.id,
      inicio: p.inicio,
      fim: p.fim,
      valorCentavos: p.valorCentavos,
      especialidadeExigida: p.especialidadeExigida,
      medicoExecutanteId: p.medicoExecutanteId,
      instituicaoId: instituicao.id,
      prazoConviteMinutos: instituicao.prazoConviteMinutos,
    };
  }

  /**
   * O próximo lote do matching. Devolve quantos entraram na fila.
   *
   * Elegíveis pela DEC-062, sem quem já foi convidado nesta fila, ordenados pela
   * DEC-136 — que não recebe valor nenhum.
   */
  private async loteDoMatching(
    tx: Tx,
    { fila, plantao, excluir }: Contexto,
    trilha: Trilha,
  ): Promise<number> {
    const jaConvidados = await tx.convite.findMany({
      where: { plantaoId: fila.plantaoId, repasseId: fila.repasseId },
      select: { medicoId: true },
    });

    const elegiveis = await this.instituicao.elegiveis(
      plantao,
      [...excluir, ...jaConvidados.map((c) => c.medicoId)],
      tx,
    );

    if (elegiveis.length === 0) {
      return 0;
    }

    const ids = elegiveis.map((e) => e.id);
    const desde = new Date(Date.now() - JANELA_DA_TAXA_DE_RESPOSTA_DIAS * 86_400_000);

    const [vinculo, cumpridos, respostas] = await Promise.all([
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
      // DEC-136 — convites que chegaram a ser a vez da pessoa, na janela recente.
      tx.convite.groupBy({
        by: ['medicoId', 'status'],
        where: {
          medicoId: { in: ids },
          status: { in: ['ACEITO', 'RECUSADO', 'EXPIRADO'] },
          ativadoEm: { gte: desde },
        },
        _count: { _all: true },
      }),
    ]);

    const contagem = (grupos: typeof vinculo, id: string): number =>
      grupos.find((g) => g.medicoExecutanteId === id)?._count._all ?? 0;

    const historico = (id: string): { respondidos: number; recebidos: number } => {
      const doMedico = respostas.filter((r) => r.medicoId === id);
      const soma = (status: readonly string[]): number =>
        doMedico.filter((r) => status.includes(r.status)).reduce((n, r) => n + r._count._all, 0);
      return {
        respondidos: soma(['ACEITO', 'RECUSADO']),
        recebidos: soma(['ACEITO', 'RECUSADO', 'EXPIRADO']),
      };
    };

    const lote = ordenarParaConvite(
      elegiveis.map((e) => ({
        medicoId: e.id,
        nome: e.nome,
        vinculoComInstituicao: contagem(vinculo, e.id),
        plantoesCumpridos: contagem(cumpridos, e.id),
        taxaDeResposta: taxaDeResposta(historico(e.id)),
      })),
    ).slice(0, TAMANHO_DO_LOTE);

    await this.enfileirar(
      tx,
      fila,
      lote.map((c) => c.medicoId),
      'MATCHING',
    );

    await this.auditoria.registrar(
      {
        acao: 'MATCHING_LOTE',
        ...trilha,
        payload: { convidados: lote.map((c) => c.medicoId) },
      },
      tx,
    );

    return lote.length;
  }
}
