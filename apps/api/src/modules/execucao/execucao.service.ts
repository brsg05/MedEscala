import { Injectable } from '@nestjs/common';
import type { Prisma, StatusPlantao } from '@prisma/client';
import {
  ANTECEDENCIA_DO_CHECKIN_MS,
  formatarDataHora,
  type PlantaoResponse,
  type ResultadoContestacao,
  type UsuarioAutenticado,
} from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CredenciamentoService } from '../credenciamento/credenciamento.service';
import { EscalaService, type PlantaoCompleto } from '../escala/escala.service';
import { InstituicaoService } from '../escala/instituicao.service';
import { podeTransicionar } from '../escala/domain/plantao.state';
import { NotificacaoService } from '../notificacao/notificacao.service';
import { TermoService } from '../termos/termo.service';
import { FinanceiroService } from '../financeiro/financeiro.service';
import { descreverPlantao } from '../notificacao/textos';
import { FilaDeConvitesService } from '../repasse/fila-de-convites.service';
import {
  ContestacaoJaRespondidaError,
  ForaDaJanelaDeExecucaoError,
  PrazoDeContestacaoEncerradoError,
  RepasseEmAndamentoError,
  SemAcessoAoRecursoError,
  TransicaoInvalidaError,
} from '../../shared/errors/dominio-negocio.error';
import { checkinAberto, checkoutAberto, contestavelAte, podeContestar } from './domain/janelas';

type Tx = Prisma.TransactionClient;

function descricao(p: PlantaoCompleto): string {
  return descreverPlantao({
    setor: p.escala.setor.nome,
    unidade: p.escala.setor.unidade.nome,
    inicio: p.inicio,
  });
}

/**
 * F16 — confirmação de execução (DEC-130 a DEC-134).
 *
 * Usa a máquina de estados que o plantão já tinha (ADR-020), sem estado novo:
 *
 * - check-in:  CONFIRMADO → EM_EXECUCAO (executante);
 * - check-out: EM_EXECUCAO → EXECUTADO (executante), contestável até
 *   `contestavelAte` (DEC-132);
 * - sem confirmação (DEC-131) é derivado do horário; a instituição confirma
 *   (→ EXECUTADO) ou contesta (→ CONTESTADO);
 * - CONTESTADO: o executante pode responder; a instituição fecha como EXECUTADO
 *   (improcedente) ou CANCELADO (procedente) — DEC-134.
 *
 * Toda transição usa `updateMany` com o status esperado no `where`: se duas
 * ações correrem juntas, só uma encontra o plantão no estado de partida.
 */
@Injectable()
export class ExecucaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly notificacoes: NotificacaoService,
    private readonly credenciamento: CredenciamentoService,
    private readonly escala: EscalaService,
    private readonly instituicao: InstituicaoService,
    private readonly fila: FilaDeConvitesService,
    private readonly termos: TermoService,
    private readonly financeiro: FinanceiroService,
  ) {}

  // --- executante -------------------------------------------------------------

  async checkin(plantaoId: string, usuario: UsuarioAutenticado): Promise<PlantaoResponse> {
    const agora = new Date();

    // Repasse ainda SOLICITADO quando o plantão começa é encerrado pela fila
    // (DEC-104); a varredura garante isso antes de olhar o estado.
    await this.fila.varrerVencidos(agora);

    const plantao = await this.doExecutante(plantaoId, usuario);

    if (plantao.status === 'EM_REPASSE') {
      throw new RepasseEmAndamentoError();
    }
    this.exigirTransicao(plantao.status, 'EM_EXECUCAO');

    if (!checkinAberto(plantao, agora)) {
      throw new ForaDaJanelaDeExecucaoError(
        agora < plantao.inicio
          ? `O check-in abre ${String(ANTECEDENCIA_DO_CHECKIN_MS / 60_000)} minutos antes do início`
          : 'O plantão já terminou; a instituição confirma ou contesta',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.mover(tx, plantaoId, plantao.status, 'EM_EXECUCAO', { checkinEm: agora });
      await this.auditoria.registrar(
        {
          acao: 'CHECKIN_REGISTRADO',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId: usuario.id,
          estadoAnterior: plantao.status,
          estadoNovo: 'EM_EXECUCAO',
        },
        tx,
      );
      // DEC-185 — na escala direta, o check-in é o aceite do contrato.
      if (plantao.medicoExecutanteId !== null) {
        await this.termos.aceitarNoCheckin(tx, plantaoId, plantao.medicoExecutanteId, {
          usuarioId: usuario.id,
          acao: 'Fez check-in',
          em: agora,
        });
      }
    });

    return this.resposta(plantaoId);
  }

  async checkout(plantaoId: string, usuario: UsuarioAutenticado): Promise<PlantaoResponse> {
    const agora = new Date();
    const plantao = await this.doExecutante(plantaoId, usuario);

    if (plantao.status !== 'EM_EXECUCAO') {
      throw new TransicaoInvalidaError('Plantao', plantao.status, 'EXECUTADO');
    }

    if (!checkoutAberto(plantao, agora)) {
      throw new ForaDaJanelaDeExecucaoError(
        'O check-out só é possível depois do início do plantão',
      );
    }

    const inst = plantao.escala.setor.unidade.instituicao;
    const ate = contestavelAte(agora, inst.prazoContestacaoHoras);

    await this.prisma.$transaction(async (tx) => {
      await this.mover(tx, plantaoId, 'EM_EXECUCAO', 'EXECUTADO', {
        checkoutEm: agora,
        contestavelAte: ate,
      });
      await this.auditoria.registrar(
        {
          acao: 'CHECKOUT_REGISTRADO',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId: usuario.id,
          estadoAnterior: 'EM_EXECUCAO',
          estadoNovo: 'EXECUTADO',
          payload: { contestavelAte: ate.toISOString() },
        },
        tx,
      );
      // F15 — cumprido: captura e retém até o fim do prazo (DEC-201, DEC-202).
      await this.financeiro.aoCumprir(tx, plantaoId, agora, ate);
      await this.notificacoes.notificar(tx, [{ chefiasDe: inst.id }], {
        tipo: 'CHECKOUT_REGISTRADO',
        titulo: 'Check-out registrado',
        corpo: `${plantao.executante?.usuario.nome ?? 'O executante'} encerrou ${descricao(plantao)}. Se algo não confere, conteste até ${formatarDataHora(ate)}.`,
        link: `/instituicao/${inst.id}/escala`,
        entidade: 'Plantao',
        entidadeId: plantaoId,
      });
    });

    return this.resposta(plantaoId);
  }

  /** DEC-134 — a versão do executante, uma vez, antes da decisão. */
  async responder(
    plantaoId: string,
    usuario: UsuarioAutenticado,
    resposta: string,
  ): Promise<PlantaoResponse> {
    const plantao = await this.doExecutante(plantaoId, usuario);

    if (plantao.status !== 'CONTESTADO' || plantao.contestacao === null) {
      throw new TransicaoInvalidaError('Plantao', plantao.status, 'CONTESTADO');
    }
    if (plantao.contestacao.resposta !== null) {
      throw new ContestacaoJaRespondidaError();
    }

    const inst = plantao.escala.setor.unidade.instituicao;

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.contestacao.updateMany({
        where: { plantaoId, resposta: null, resultado: null },
        data: { resposta, respondidaEm: new Date() },
      });
      if (count === 0) {
        throw new ContestacaoJaRespondidaError();
      }

      await this.auditoria.registrar(
        {
          acao: 'CONTESTACAO_RESPONDIDA',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId: usuario.id,
          payload: { resposta },
        },
        tx,
      );
      await this.notificacoes.notificar(tx, [{ chefiasDe: inst.id }], {
        tipo: 'CONTESTACAO_RESPONDIDA',
        titulo: 'Contestação respondida',
        corpo: `${plantao.executante?.usuario.nome ?? 'O executante'} respondeu sobre ${descricao(plantao)}: "${resposta}".`,
        link: `/instituicao/${inst.id}/escala`,
        entidade: 'Plantao',
        entidadeId: plantaoId,
      });
    });

    return this.resposta(plantaoId);
  }

  // --- instituição ------------------------------------------------------------

  /** DEC-131 — terminou sem confirmação, e a instituição atesta que foi cumprido. */
  async confirmar(plantaoId: string, usuario: UsuarioAutenticado): Promise<PlantaoResponse> {
    const agora = new Date();
    const plantao = await this.daInstituicao(plantaoId, usuario);

    if (
      !(plantao.status === 'CONFIRMADO' || plantao.status === 'EM_EXECUCAO') ||
      plantao.fim > agora
    ) {
      throw new TransicaoInvalidaError('Plantao', plantao.status, 'EXECUTADO');
    }

    await this.prisma.$transaction(async (tx) => {
      // Sem `contestavelAte`: quem contestaria é quem acabou de confirmar.
      await this.mover(tx, plantaoId, plantao.status, 'EXECUTADO', {});
      await this.auditoria.registrar(
        {
          acao: 'EXECUCAO_CONFIRMADA_PELA_INSTITUICAO',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId: usuario.id,
          estadoAnterior: plantao.status,
          estadoNovo: 'EXECUTADO',
        },
        tx,
      );
      // Sem prazo de contestação: o médico ainda tem o prazo padrão para emitir a nota.
      await this.financeiro.aoCumprir(tx, plantaoId, agora, null);
      await this.avisarExecutante(tx, plantao, {
        tipo: 'PLANTAO_CONFIRMADO',
        titulo: 'Plantão confirmado',
        corpo: `A instituição confirmou que você cumpriu ${descricao(plantao)}.`,
      });
    });

    return this.resposta(plantaoId);
  }

  async contestar(
    plantaoId: string,
    usuario: UsuarioAutenticado,
    justificativa: string,
  ): Promise<PlantaoResponse> {
    const agora = new Date();
    const plantao = await this.daInstituicao(plantaoId, usuario);

    const pode = podeContestar(plantao, agora);
    if (pode === 'prazo-encerrado') {
      throw new PrazoDeContestacaoEncerradoError();
    }
    if (pode === 'estado-invalido') {
      throw new TransicaoInvalidaError('Plantao', plantao.status, 'CONTESTADO');
    }

    const inst = plantao.escala.setor.unidade.instituicao;

    await this.prisma.$transaction(async (tx) => {
      await this.mover(tx, plantaoId, plantao.status, 'CONTESTADO', {});
      await tx.contestacao.create({
        data: { plantaoId, justificativa, abertaPorId: usuario.id, abertaEm: agora },
      });
      await this.auditoria.registrar(
        {
          acao: 'PLANTAO_CONTESTADO',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId: usuario.id,
          estadoAnterior: plantao.status,
          estadoNovo: 'CONTESTADO',
          payload: { justificativa },
        },
        tx,
      );
      await this.avisarExecutante(tx, plantao, {
        tipo: 'PLANTAO_CONTESTADO',
        titulo: 'Plantão contestado',
        corpo: `${inst.nome} contestou ${descricao(plantao)}: "${justificativa}". Você pode responder com a sua versão.`,
      });
    });

    return this.resposta(plantaoId);
  }

  /** ADR-020 — improcedente segue como EXECUTADO; procedente cancela. */
  async resolver(
    plantaoId: string,
    usuario: UsuarioAutenticado,
    resultado: ResultadoContestacao,
    nota: string,
  ): Promise<PlantaoResponse> {
    const plantao = await this.daInstituicao(plantaoId, usuario);

    if (plantao.status !== 'CONTESTADO') {
      throw new TransicaoInvalidaError('Plantao', plantao.status, 'resolução');
    }

    const destino: StatusPlantao = resultado === 'IMPROCEDENTE' ? 'EXECUTADO' : 'CANCELADO';
    this.exigirTransicao('CONTESTADO', destino);

    await this.prisma.$transaction(async (tx) => {
      // A janela de contestação não reabre: a decisão é final.
      await this.mover(tx, plantaoId, 'CONTESTADO', destino, { contestavelAte: null });
      await tx.contestacao.update({
        where: { plantaoId },
        data: { resultado, nota, resolvidaPorId: usuario.id, resolvidaEm: new Date() },
      });
      await this.auditoria.registrar(
        {
          acao: 'CONTESTACAO_RESOLVIDA',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId: usuario.id,
          estadoAnterior: 'CONTESTADO',
          estadoNovo: destino,
          payload: { resultado, nota },
        },
        tx,
      );
      // DEC-191 — procedente estorna; improcedente segue para a liberação.
      if (resultado === 'PROCEDENTE') {
        await this.financeiro.aoContestacaoProcedente(tx, plantaoId, new Date());
      } else {
        await this.financeiro.aoContestacaoImprocedente(tx, plantaoId, new Date());
      }
      await this.avisarExecutante(tx, plantao, {
        tipo: 'CONTESTACAO_RESOLVIDA',
        titulo:
          resultado === 'IMPROCEDENTE' ? 'Contestação encerrada a seu favor' : 'Plantão cancelado',
        corpo:
          resultado === 'IMPROCEDENTE'
            ? `A instituição manteve ${descricao(plantao)} como cumprido: "${nota}".`
            : `A instituição cancelou ${descricao(plantao)} após a contestação: "${nota}".`,
      });
    });

    return this.resposta(plantaoId);
  }

  // --- lembretes agendados (F22) -----------------------------------------------

  /**
   * Os dois avisos que dependem do relógio, e não de uma ação: check-in liberado
   * (executante) e plantão terminado sem confirmação (chefias). Cada um sai uma
   * vez só — a marca na própria linha do plantão impede repetir. Roda pelo job
   * recorrente do BullMQ; se o Redis faltar, o que se perde é o lembrete, nunca
   * um estado: "sem confirmação" é derivado do horário (DEC-131).
   */
  async varrerLembretes(agora: Date = new Date()): Promise<void> {
    const checkinsAbertos = await this.prisma.plantao.findMany({
      where: {
        status: 'CONFIRMADO',
        lembreteCheckinEm: null,
        medicoExecutanteId: { not: null },
        inicio: { lte: new Date(agora.getTime() + ANTECEDENCIA_DO_CHECKIN_MS) },
        fim: { gt: agora },
      },
      select: { id: true },
    });

    for (const { id } of checkinsAbertos) {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.plantao.updateMany({
          where: { id, lembreteCheckinEm: null },
          data: { lembreteCheckinEm: agora },
        });
        if (count === 0) return;

        const p = await this.escala.buscarPlantao(id);
        await this.avisarExecutante(tx, p, {
          tipo: 'CHECKIN_LIBERADO',
          titulo: 'Check-in liberado',
          corpo: `${descricao(p)}. Faça o check-in ao chegar.`,
        });
      });
    }

    const semConfirmacao = await this.prisma.plantao.findMany({
      where: {
        status: { in: ['CONFIRMADO', 'EM_EXECUCAO'] },
        alertaSemConfirmacaoEm: null,
        fim: { lte: agora },
      },
      select: { id: true },
    });

    for (const { id } of semConfirmacao) {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.plantao.updateMany({
          where: { id, alertaSemConfirmacaoEm: null },
          data: { alertaSemConfirmacaoEm: agora },
        });
        if (count === 0) return;

        const p = await this.escala.buscarPlantao(id);
        const inst = p.escala.setor.unidade.instituicao;
        await this.notificacoes.notificar(tx, [{ chefiasDe: inst.id }], {
          tipo: 'PLANTAO_SEM_CONFIRMACAO',
          titulo: 'Plantão sem confirmação',
          corpo: `${descricao(p)} terminou sem ${p.status === 'CONFIRMADO' ? 'check-in' : 'check-out'} de ${p.executante?.usuario.nome ?? 'ninguém'}. Confirme ou conteste.`,
          link: `/instituicao/${inst.id}/escala`,
          entidade: 'Plantao',
          entidadeId: id,
        });
      });
    }
  }

  // --- internos ---------------------------------------------------------------

  /** Só o executante age sobre a própria execução; para os demais, 404 (ADR-026). */
  private async doExecutante(
    plantaoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<PlantaoCompleto> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    const plantao = await this.escala.buscarPlantao(plantaoId);

    if (plantao.medicoExecutanteId !== medico.id) {
      throw new SemAcessoAoRecursoError();
    }
    return plantao;
  }

  /** A chefia da instituição do plantão confirma, contesta e resolve. */
  private async daInstituicao(
    plantaoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<PlantaoCompleto> {
    const plantao = await this.escala.buscarPlantao(plantaoId);
    this.instituicao.exigirPapel(
      usuario,
      plantao.escala.setor.unidade.instituicaoId,
      'CHEFIA_ESCALA',
    );
    return plantao;
  }

  private async mover(
    tx: Tx,
    plantaoId: string,
    de: StatusPlantao,
    para: StatusPlantao,
    dados: Prisma.PlantaoUpdateManyMutationInput,
  ): Promise<void> {
    this.exigirTransicao(de, para);
    const { count } = await tx.plantao.updateMany({
      where: { id: plantaoId, status: de },
      data: { ...dados, status: para },
    });
    // Outra ação mudou o plantão entre a leitura e esta escrita.
    if (count === 0) {
      throw new TransicaoInvalidaError('Plantao', de, para);
    }
  }

  private exigirTransicao(de: StatusPlantao, para: StatusPlantao): void {
    if (!podeTransicionar(de, para)) {
      throw new TransicaoInvalidaError('Plantao', de, para);
    }
  }

  private async avisarExecutante(
    tx: Tx,
    plantao: PlantaoCompleto,
    aviso: {
      tipo: Parameters<NotificacaoService['notificar']>[2]['tipo'];
      titulo: string;
      corpo: string;
    },
  ): Promise<void> {
    if (plantao.medicoExecutanteId === null) return;
    await this.notificacoes.notificar(tx, [{ medicoId: plantao.medicoExecutanteId }], {
      ...aviso,
      link: '/escala',
      entidade: 'Plantao',
      entidadeId: plantao.id,
    });
  }

  private async resposta(plantaoId: string): Promise<PlantaoResponse> {
    return this.escala.paraResposta(await this.escala.buscarPlantao(plantaoId));
  }
}
