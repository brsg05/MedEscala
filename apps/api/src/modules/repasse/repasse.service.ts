import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, StatusRepasse } from '@prisma/client';
import type { AbrirRepasseRequest, ConviteResponse, RepasseResponse } from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscalaService } from '../escala/escala.service';
import {
  AntecedenciaInsuficienteError,
  ForaDoEscopoDaInstituicaoError,
  NaoEhConvidadoDaVezError,
  NaoEhTitularError,
  PlantaoNaoRepassavelError,
  RepasseJaEmAbertoError,
  RepasseNaoEncontradoError,
  TransicaoInvalidaError,
} from '../../shared/errors/dominio-negocio.error';
import { aceitaRepasse } from '../escala/domain/plantao.state';
import { respeitaAntecedenciaMinima } from '../escala/domain/agenda.rules';
import { EM_ABERTO, podeTransicionar } from './domain/repasse.state';
import { FilaDeConvitesService } from './fila-de-convites.service';
import { NotificacaoService } from '../notificacao/notificacao.service';
import { TermoService } from '../termos/termo.service';
import { descreverPlantao } from '../notificacao/textos';

const RESUMO_MEDICO = { include: { usuario: { select: { nome: true } } } } as const;

const REPASSE_COMPLETO = {
  titular: RESUMO_MEDICO,
  substituto: RESUMO_MEDICO,
  convites: {
    where: { status: 'ATIVO' as const },
    include: { medico: RESUMO_MEDICO },
  },
} as const;

type RepasseCompleto = Prisma.RepasseGetPayload<{ include: typeof REPASSE_COMPLETO }>;

/** Onde e quando, para o texto dos avisos (F22). */
function descricao(p: {
  inicio: Date;
  escala: { setor: { nome: string; unidade: { nome: string } } };
}): string {
  return descreverPlantao({
    setor: p.escala.setor.nome,
    unidade: p.escala.setor.unidade.nome,
    inicio: p.inicio,
  });
}

function resumo(m: { id: string; crm: string; crmUf: string; usuario: { nome: string } }) {
  return { id: m.id, nome: m.usuario.nome, crm: m.crm, crmUf: m.crmUf };
}

/**
 * F07, F10 e F11 — o núcleo do projeto.
 *
 * A Entrega 1 identifica o repasse como "o elo mais informal da cadeia". Este
 * serviço é a tradução da §5.1: o fluxo é **triádico** (titular → substituto →
 * instituição) e a aprovação institucional é etapa obrigatória e bloqueante.
 *
 * Como o substituto é encontrado mora na `FilaDeConvitesService` (DEC-087 a
 * DEC-099). Este serviço cuida das transições do repasse e é o ÚNICO caminho que
 * altera `Plantao.medicoExecutanteId` — com trigger no Postgres recusando
 * qualquer outro (`supabase/policies/002`).
 */
@Injectable()
export class RepasseService {
  private readonly logger = new Logger(RepasseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly escala: EscalaService,
    private readonly fila: FilaDeConvitesService,
    private readonly notificacoes: NotificacaoService,
    private readonly termos: TermoService,
  ) {}

  /**
   * F07 — abrir o pedido. Com indicados, Forma 1 (fila na ordem dada); sem,
   * Forma 2 (o matching convida). Os indicados são validados antes de qualquer
   * escrita, para não nascer repasse pela metade.
   */
  async abrir(
    plantaoId: string,
    medicoTitularId: string,
    dados: AbrirRepasseRequest,
  ): Promise<RepasseResponse> {
    const plantao = await this.escala.buscarPlantao(plantaoId);

    if (!aceitaRepasse(plantao.status)) {
      throw new PlantaoNaoRepassavelError(plantao.status);
    }

    // Quem pede é quem responde pelo turno hoje — não o titular original, se já
    // houve um repasse anterior.
    if (plantao.medicoExecutanteId !== medicoTitularId) {
      throw new NaoEhTitularError();
    }

    const instituicao = plantao.escala.setor.unidade.instituicao;

    if (!respeitaAntecedenciaMinima(plantao.inicio, instituicao.antecedenciaMinimaRepasseHoras)) {
      throw new AntecedenciaInsuficienteError(instituicao.antecedenciaMinimaRepasseHoras);
    }

    const emAberto = await this.prisma.repasse.findFirst({
      where: { plantaoId, status: { in: [...EM_ABERTO] } },
      select: { id: true },
    });

    if (emAberto !== null) {
      throw new RepasseJaEmAbertoError();
    }

    await this.fila.validarIndicados(plantao, medicoTitularId, dados.indicados);

    const criado = await this.prisma.$transaction(async (tx) => {
      const repasse = await tx.repasse.create({
        data: {
          plantaoId,
          medicoTitularId,
          motivo: dados.motivo,
          modeloFiscal: dados.modeloFiscal,
        },
      });

      await tx.plantao.update({ where: { id: plantaoId }, data: { status: 'EM_REPASSE' } });

      await this.fila.enfileirar(
        tx,
        { plantaoId, repasseId: repasse.id },
        dados.indicados,
        'INDICACAO',
      );

      await this.auditoria.registrar(
        {
          acao: 'REPASSE_SOLICITADO',
          entidade: 'Repasse',
          entidadeId: repasse.id,
          atorId: medicoTitularId,
          estadoNovo: 'SOLICITADO',
          payload: {
            plantaoId,
            modeloFiscal: dados.modeloFiscal,
            forma: dados.indicados.length > 0 ? 'INDICACAO' : 'MATCHING',
            indicados: dados.indicados.length,
          },
        },
        tx,
      );

      await this.auditoria.registrar(
        {
          acao: 'PLANTAO_EM_REPASSE',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId: medicoTitularId,
          estadoAnterior: plantao.status,
          estadoNovo: 'EM_REPASSE',
        },
        tx,
      );

      return repasse;
    });

    // Convida o primeiro da fila — ou roda o matching, se não houve indicação.
    await this.fila.avancar(criado.id);

    return this.buscar(criado.id);
  }

  /**
   * F10 — o convidado da vez aceita.
   *
   * Só ele: antes da fila, qualquer médico que soubesse o id aceitava um repasse
   * em aberto. O §7.3 tem dois estados para o ato (`SUBSTITUTO_ACEITO` e
   * `AGUARDANDO_APROVACAO`); a transação percorre os dois e grava ambos na trilha.
   */
  async aceitar(repasseId: string, medicoId: string): Promise<RepasseResponse> {
    // Vence o convite com prazo passado antes de olhar de quem é a vez (DEC-097).
    await this.fila.avancar(repasseId);

    const repasse = await this.exigir(repasseId);
    const convite = await this.prisma.convite.findFirst({
      where: { repasseId, status: 'ATIVO', medicoId },
    });

    if (convite === null) {
      throw new NaoEhConvidadoDaVezError();
    }

    this.exigirTransicao(repasse.status, 'SUBSTITUTO_ACEITO');
    this.exigirTransicao('SUBSTITUTO_ACEITO', 'AGUARDANDO_APROVACAO');

    const plantao = await this.escala.buscarPlantao(repasse.plantaoId);

    // RN03 — a agenda pode ter mudado desde o convite.
    await this.escala.exigirAgendaLivre(medicoId, { inicio: plantao.inicio, fim: plantao.fim });

    const substituto = await this.nomeDoMedico(medicoId);

    await this.prisma.$transaction(async (tx) => {
      await tx.convite.update({
        where: { id: convite.id },
        data: { status: 'ACEITO', respondidoEm: new Date() },
      });

      // Os demais da fila ficam NA_FILA, adormecidos: se a chefia recusar este
      // substituto, a fila retoma do próximo (DEC-099).
      await tx.repasse.update({
        where: { id: repasseId },
        data: { medicoSubstitutoId: medicoId, status: 'AGUARDANDO_APROVACAO' },
      });

      await this.auditoria.registrar(
        {
          acao: 'REPASSE_ACEITO_PELO_SUBSTITUTO',
          entidade: 'Repasse',
          entidadeId: repasseId,
          atorId: medicoId,
          estadoAnterior: repasse.status,
          estadoNovo: 'SUBSTITUTO_ACEITO',
        },
        tx,
      );

      await this.auditoria.registrar(
        {
          acao: 'REPASSE_ENVIADO_PARA_APROVACAO',
          entidade: 'Repasse',
          entidadeId: repasseId,
          atorId: medicoId,
          estadoAnterior: 'SUBSTITUTO_ACEITO',
          estadoNovo: 'AGUARDANDO_APROVACAO',
        },
        tx,
      );

      await this.notificacoes.notificar(tx, [{ medicoId: repasse.medicoTitularId }], {
        tipo: 'SUBSTITUTO_ACEITOU',
        titulo: 'Substituto encontrado',
        corpo: `${substituto} aceitou cobrir ${descricao(plantao)}. Falta a aprovação da instituição — até lá, o plantão continua seu.`,
        link: '/repasses',
        entidade: 'Repasse',
        entidadeId: repasseId,
      });

      const instituicaoId = plantao.escala.setor.unidade.instituicaoId;
      await this.notificacoes.notificar(tx, [{ chefiasDe: instituicaoId }], {
        tipo: 'APROVACAO_PENDENTE',
        titulo: 'Substituição aguardando aprovação',
        corpo: `${repasse.titular.usuario.nome} → ${substituto}, ${descricao(plantao)}.`,
        link: `/instituicao/${instituicaoId}/decisoes`,
        entidade: 'Repasse',
        entidadeId: repasseId,
      });
    });

    this.fila.cancelarVencimento(convite.id);

    return this.buscar(repasseId);
  }

  /** O convidado da vez recusa; a fila passa ao próximo. */
  async recusarConvite(repasseId: string, medicoId: string): Promise<RepasseResponse> {
    await this.fila.avancar(repasseId);

    const convite = await this.prisma.convite.findFirst({
      where: { repasseId, status: 'ATIVO', medicoId },
    });

    if (convite === null) {
      throw new NaoEhConvidadoDaVezError();
    }

    const repasse = await this.exigir(repasseId);
    const plantao = await this.escala.buscarPlantao(repasse.plantaoId);
    const convidado = await this.nomeDoMedico(medicoId);

    await this.prisma.$transaction(async (tx) => {
      await tx.convite.update({
        where: { id: convite.id },
        data: { status: 'RECUSADO', respondidoEm: new Date() },
      });

      await this.notificacoes.notificar(tx, [{ medicoId: repasse.medicoTitularId }], {
        tipo: 'CONVITE_RECUSADO',
        titulo: 'Convite recusado',
        corpo: `${convidado} recusou o convite para ${descricao(plantao)}. A fila segue.`,
        link: '/repasses',
        entidade: 'Repasse',
        entidadeId: repasseId,
      });

      await this.auditoria.registrar(
        {
          acao: 'CONVITE_RECUSADO',
          entidade: 'Repasse',
          entidadeId: repasseId,
          atorId: medicoId,
          estadoAnterior: 'ATIVO',
          estadoNovo: 'RECUSADO',
          payload: { ordem: convite.ordem },
        },
        tx,
      );
    });

    this.fila.cancelarVencimento(convite.id);
    await this.fila.avancar(repasseId);

    return this.buscar(repasseId);
  }

  /**
   * F11 — aprovação da chefia. **Etapa bloqueante** (Entrega 1, §5.1).
   *
   * É aqui, e só aqui, que `Plantao.medicoExecutanteId` muda. A ordem importa: o
   * repasse vira APROVADO **antes** do UPDATE no plantão, porque o trigger da RN01
   * procura um repasse aprovado — e dentro da transação ele enxerga a escrita.
   */
  async aprovar(
    repasseId: string,
    aprovadorUsuarioId: string,
    instituicoesDoAprovador: readonly string[],
  ): Promise<RepasseResponse> {
    const repasse = await this.exigir(repasseId);

    this.exigirTransicao(repasse.status, 'APROVADO');

    const plantao = await this.escala.buscarPlantao(repasse.plantaoId);

    if (!instituicoesDoAprovador.includes(plantao.escala.setor.unidade.instituicaoId)) {
      throw new ForaDoEscopoDaInstituicaoError();
    }

    if (repasse.medicoSubstitutoId === null) {
      throw new TransicaoInvalidaError('Repasse', repasse.status, 'APROVADO');
    }

    const substitutoId = repasse.medicoSubstitutoId;
    const aprovadoEm = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.repasse.update({
        where: { id: repasseId },
        data: { status: 'APROVADO', aprovadoPorId: aprovadorUsuarioId, aprovadoEm },
      });

      // A troca do executante — o único ponto do sistema que faz isto.
      await tx.plantao.update({
        where: { id: repasse.plantaoId },
        data: { medicoExecutanteId: substitutoId, status: 'CONFIRMADO' },
      });

      // Quem ainda esperava na fila não chega mais a ser convidado.
      await tx.convite.updateMany({
        where: { repasseId, status: 'NA_FILA' },
        data: { status: 'CANCELADO' },
      });

      // F12 — a escala oficial mudou, então sua versão avança.
      await tx.escala.update({
        where: { id: plantao.escalaId },
        data: { versao: { increment: 1 } },
      });

      await this.auditoria.registrar(
        {
          acao: 'REPASSE_APROVADO',
          entidade: 'Repasse',
          entidadeId: repasseId,
          atorId: aprovadorUsuarioId,
          estadoAnterior: repasse.status,
          estadoNovo: 'APROVADO',
        },
        tx,
      );

      await this.auditoria.registrar(
        {
          acao: 'EXECUTANTE_SUBSTITUIDO',
          entidade: 'Plantao',
          entidadeId: repasse.plantaoId,
          atorId: aprovadorUsuarioId,
          estadoAnterior: plantao.medicoExecutanteId,
          estadoNovo: substitutoId,
          payload: { repasseId, escalaVersaoAnterior: plantao.escala.versao },
        },
        tx,
      );

      // F13 — a terceira assinatura fecha o termo de substituição (DEC-184).
      await this.termos.emitirSubstituicao(tx, repasseId, {
        usuarioId: aprovadorUsuarioId,
        acao: 'Aprovou a substituição',
        em: aprovadoEm,
      });

      const nomeSubstituto = repasse.substituto?.usuario.nome ?? 'O substituto';

      await this.notificacoes.notificar(tx, [{ medicoId: repasse.medicoTitularId }], {
        tipo: 'REPASSE_APROVADO',
        titulo: 'Repasse aprovado',
        corpo: `${nomeSubstituto} assume ${descricao(plantao)}. A escala oficial foi atualizada.`,
        link: '/repasses',
        entidade: 'Repasse',
        entidadeId: repasseId,
      });

      await this.notificacoes.notificar(tx, [{ medicoId: substitutoId }], {
        tipo: 'REPASSE_APROVADO',
        titulo: 'Plantão confirmado para você',
        corpo: `A instituição aprovou a substituição: você assume ${descricao(plantao)}.`,
        link: '/escala',
        entidade: 'Repasse',
        entidadeId: repasseId,
      });
    });

    this.logger.log(
      `Repasse ${repasseId} aprovado; executante do plantão ${repasse.plantaoId} trocado`,
    );

    return this.buscar(repasseId);
  }

  /**
   * F11 — a chefia recusa o SUBSTITUTO, não o repasse (DEC-099).
   *
   * O repasse passa por RECUSADO_INSTITUICAO — com a justificativa gravada, como
   * a F11 exige — e volta a SOLICITADO pela transição que o §7.3 já previa. A fila
   * retoma do próximo. `medicoExecutanteId` nunca mudou: o titular segue
   * responsável o tempo todo (RN01).
   */
  async recusar(
    repasseId: string,
    aprovadorUsuarioId: string,
    justificativa: string,
    instituicoesDoAprovador: readonly string[],
  ): Promise<RepasseResponse> {
    const repasse = await this.exigir(repasseId);

    this.exigirTransicao(repasse.status, 'RECUSADO_INSTITUICAO');
    this.exigirTransicao('RECUSADO_INSTITUICAO', 'SOLICITADO');

    const plantao = await this.escala.buscarPlantao(repasse.plantaoId);

    if (!instituicoesDoAprovador.includes(plantao.escala.setor.unidade.instituicaoId)) {
      throw new ForaDoEscopoDaInstituicaoError();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.repasse.update({
        where: { id: repasseId },
        data: { status: 'RECUSADO_INSTITUICAO', justificativaRecusa: justificativa },
      });

      await this.auditoria.registrar(
        {
          acao: 'REPASSE_RECUSADO_PELA_INSTITUICAO',
          entidade: 'Repasse',
          entidadeId: repasseId,
          atorId: aprovadorUsuarioId,
          estadoAnterior: repasse.status,
          estadoNovo: 'RECUSADO_INSTITUICAO',
          payload: { justificativa, substitutoRecusado: repasse.medicoSubstitutoId },
        },
        tx,
      );

      await tx.repasse.update({
        where: { id: repasseId },
        data: { status: 'SOLICITADO', medicoSubstitutoId: null },
      });

      await this.auditoria.registrar(
        {
          acao: 'FILA_RETOMADA',
          entidade: 'Repasse',
          entidadeId: repasseId,
          atorId: aprovadorUsuarioId,
          estadoAnterior: 'RECUSADO_INSTITUICAO',
          estadoNovo: 'SOLICITADO',
        },
        tx,
      );

      const nomeSubstituto = repasse.substituto?.usuario.nome ?? 'O substituto';

      await this.notificacoes.notificar(tx, [{ medicoId: repasse.medicoTitularId }], {
        tipo: 'REPASSE_RECUSADO',
        titulo: 'Substituto recusado pela instituição',
        corpo: `A instituição recusou ${nomeSubstituto} para ${descricao(plantao)}: "${justificativa}". A fila de convites continua.`,
        link: '/repasses',
        entidade: 'Repasse',
        entidadeId: repasseId,
      });

      if (repasse.medicoSubstitutoId !== null) {
        await this.notificacoes.notificar(tx, [{ medicoId: repasse.medicoSubstitutoId }], {
          tipo: 'REPASSE_RECUSADO',
          titulo: 'Substituição não aprovada',
          corpo: `A instituição não aprovou você para ${descricao(plantao)}: "${justificativa}".`,
          entidade: 'Repasse',
          entidadeId: repasseId,
        });
      }
    });

    await this.fila.avancar(repasseId);

    return this.buscar(repasseId);
  }

  /**
   * O titular desiste do repasse enquanto ninguém aceitou. Depois do aceite, a
   * decisão é da chefia — o §7.3 não prevê cancelamento a partir dali.
   */
  async cancelar(repasseId: string, titularId: string): Promise<RepasseResponse> {
    const repasse = await this.exigir(repasseId);

    if (repasse.medicoTitularId !== titularId) {
      throw new NaoEhTitularError();
    }

    this.exigirTransicao(repasse.status, 'CANCELADO');

    const ativos = await this.prisma.convite.findMany({
      where: { repasseId, status: 'ATIVO' },
      select: { id: true, medicoId: true },
    });
    const plantao = await this.escala.buscarPlantao(repasse.plantaoId);

    await this.prisma.$transaction(async (tx) => {
      await tx.convite.updateMany({
        where: { repasseId, status: { in: ['NA_FILA', 'ATIVO'] } },
        data: { status: 'CANCELADO' },
      });
      await tx.repasse.update({ where: { id: repasseId }, data: { status: 'CANCELADO' } });
      await tx.plantao.update({ where: { id: repasse.plantaoId }, data: { status: 'CONFIRMADO' } });

      await this.auditoria.registrar(
        {
          acao: 'REPASSE_CANCELADO_PELO_TITULAR',
          entidade: 'Repasse',
          entidadeId: repasseId,
          atorId: titularId,
          estadoAnterior: repasse.status,
          estadoNovo: 'CANCELADO',
        },
        tx,
      );

      // Quem estava com o convite na mão precisa saber que ele não vale mais.
      await this.notificacoes.notificar(
        tx,
        ativos.map((c) => ({ medicoId: c.medicoId })),
        {
          tipo: 'CONVITE_CANCELADO',
          titulo: 'Convite cancelado',
          corpo: `O titular cancelou o pedido de repasse de ${descricao(plantao)}.`,
          entidade: 'Repasse',
          entidadeId: repasseId,
        },
      );
    });

    for (const c of ativos) {
      this.fila.cancelarVencimento(c.id);
    }

    return this.buscar(repasseId);
  }

  /** Quando a fila volta ao titular (DEC-096), ele pode indicar mais gente. */
  async indicar(
    repasseId: string,
    titularId: string,
    ids: readonly string[],
  ): Promise<RepasseResponse> {
    const repasse = await this.exigir(repasseId);

    if (repasse.medicoTitularId !== titularId) {
      throw new NaoEhTitularError();
    }

    if (repasse.status !== 'SOLICITADO') {
      throw new TransicaoInvalidaError('Repasse', repasse.status, 'SOLICITADO');
    }

    const plantao = await this.escala.buscarPlantao(repasse.plantaoId);
    await this.fila.validarIndicados(plantao, titularId, ids);

    const jaConvidados = await this.prisma.convite.findMany({
      where: { repasseId, medicoId: { in: [...ids] } },
      select: { medicoId: true },
    });
    const novos = ids.filter((id) => !jaConvidados.some((c) => c.medicoId === id));

    await this.prisma.$transaction(async (tx) => {
      await this.fila.enfileirar(
        tx,
        { plantaoId: repasse.plantaoId, repasseId },
        novos,
        'INDICACAO',
      );
      // Nova indicação reabre a fila: quando ela esgotar, o matching roda de novo.
      await tx.repasse.update({ where: { id: repasseId }, data: { filaEsgotadaEm: null } });
    });

    await this.fila.avancar(repasseId);

    return this.buscar(repasseId);
  }

  async buscar(repasseId: string): Promise<RepasseResponse> {
    return this.paraResposta(await this.exigir(repasseId));
  }

  /** A fila inteira — para o titular e a chefia, não para os outros convidados. */
  async filaDoRepasse(repasseId: string): Promise<ConviteResponse[]> {
    const convites = await this.prisma.convite.findMany({
      where: { repasseId },
      include: { medico: RESUMO_MEDICO },
      orderBy: { ordem: 'asc' },
    });

    return convites.map((c) => ({
      id: c.id,
      ordem: c.ordem,
      origem: c.origem,
      status: c.status,
      medico: resumo(c.medico),
      prazoAte: c.prazoAte?.toISOString() ?? null,
      respondidoEm: c.respondidoEm?.toISOString() ?? null,
    }));
  }

  private async nomeDoMedico(medicoId: string): Promise<string> {
    const m = await this.prisma.medico.findUniqueOrThrow({
      where: { id: medicoId },
      select: { usuario: { select: { nome: true } } },
    });
    return m.usuario.nome;
  }

  private async exigir(repasseId: string): Promise<RepasseCompleto> {
    const repasse = await this.prisma.repasse.findUnique({
      where: { id: repasseId },
      include: REPASSE_COMPLETO,
    });

    if (repasse === null) {
      throw new RepasseNaoEncontradoError();
    }

    return repasse;
  }

  private exigirTransicao(de: StatusRepasse, para: StatusRepasse): void {
    if (!podeTransicionar(de, para)) {
      throw new TransicaoInvalidaError('Repasse', de, para);
    }
  }

  private paraResposta(r: RepasseCompleto): RepasseResponse {
    const daVez = r.convites[0] ?? null;

    return {
      id: r.id,
      plantaoId: r.plantaoId,
      status: r.status,
      motivo: r.motivo,
      modeloFiscal: r.modeloFiscal,
      titular: resumo(r.titular),
      substituto: r.substituto === null ? null : resumo(r.substituto),
      convidadoDaVez: daVez === null ? null : resumo(daVez.medico),
      prazoConviteAte: daVez?.prazoAte?.toISOString() ?? null,
      origemConvite: daVez?.origem ?? null,
      filaEsgotada: r.filaEsgotadaEm !== null,
      aprovadoEm: r.aprovadoEm?.toISOString() ?? null,
      justificativaRecusa: r.justificativaRecusa,
    };
  }
}
