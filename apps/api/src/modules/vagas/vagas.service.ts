import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CandidaturaResponse,
  ConviteResponse,
  PlantaoResponse,
  UsuarioAutenticado,
  VagaResponse,
} from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CredenciamentoService } from '../credenciamento/credenciamento.service';
import { AtribuicaoService } from '../escala/atribuicao.service';
import { encontrarSobreposicao } from '../escala/domain/agenda.rules';
import { EscalaService, PLANTAO_COMPLETO, type PlantaoCompleto } from '../escala/escala.service';
import { InstituicaoService, instituicoesComPerfil } from '../escala/instituicao.service';
import { NotificacaoService } from '../notificacao/notificacao.service';
import { descreverPlantao } from '../notificacao/textos';
import { FilaDeConvitesService } from '../repasse/fila-de-convites.service';
import {
  CandidaturaJaRespondidaError,
  CandidaturaNaoEncontradaError,
  MedicoNaoVerificadoError,
  NaoEhConvidadoDaVezError,
  RequisitosNaoAtendidosError,
  VagaNaoAbertaError,
} from '../../shared/errors/dominio-negocio.error';

type Tx = Prisma.TransactionClient;

/** Quem mexe na vaga do lado da instituição — os mesmos que publicam e escalam. */
const PAPEIS_DA_VAGA = ['ADMIN_INSTITUICAO', 'CHEFIA_ESCALA'] as const;

/** Até onde a lista de vagas olha para a frente, para não varrer o ano inteiro. */
const LIMITE_DE_VAGAS = 100;

function descricao(p: PlantaoCompleto): string {
  return descreverPlantao({
    setor: p.escala.setor.nome,
    unidade: p.escala.setor.unidade.nome,
    inicio: p.inicio,
  });
}

/**
 * F10 — preencher uma vaga aberta (DEC-135, DEC-164 a DEC-168).
 *
 * Três caminhos levam ao mesmo lugar — um médico escalado:
 *
 * 1. a chefia **convida pela fila** (indicação ou matching); o convidado da vez
 *    aceita e a vaga se confirma, sem terceira assinatura — quem convidou foi a
 *    própria instituição;
 * 2. o médico **se candidata** e a chefia escolhe;
 * 3. a chefia **escala direto** (DEC-052).
 *
 * Os três passam por `AtribuicaoService.escalarMedico` (RN02, RN03, versão da
 * escala, trilha) e, na MESMA transação, por `fecharSelecao`: a fila para, as
 * candidaturas pendentes se encerram, e quem estava esperando é avisado. Por
 * isso a rota de escalar direto mora aqui — fora daqui ela deixaria fila e
 * candidaturas abertas para uma vaga já preenchida.
 */
@Injectable()
export class VagasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly notificacoes: NotificacaoService,
    private readonly credenciamento: CredenciamentoService,
    private readonly escala: EscalaService,
    private readonly instituicao: InstituicaoService,
    private readonly atribuicao: AtribuicaoService,
    private readonly fila: FilaDeConvitesService,
  ) {}

  // --- lado do médico ---------------------------------------------------------

  /**
   * DEC-166/167 — vagas abertas. Por padrão só as compatíveis (CRM verificado,
   * especialidade, agenda livre); `todas` mostra o resto, com o motivo — mas a
   * candidatura continua exigindo RN02 e RN03.
   */
  async vagasAbertas(usuario: UsuarioAutenticado, todas: boolean): Promise<VagaResponse[]> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    const perfil = await this.prisma.medico.findUniqueOrThrow({
      where: { id: medico.id },
      select: { especialidade: true },
    });
    const agora = new Date();

    const vagas = await this.prisma.plantao.findMany({
      where: {
        status: { in: ['ABERTO', 'EM_SELECAO'] },
        inicio: { gt: agora },
        escala: { setor: { unidade: { instituicao: { status: 'ATIVA' } } } },
      },
      include: PLANTAO_COMPLETO,
      orderBy: { inicio: 'asc' },
      take: LIMITE_DE_VAGAS,
    });

    if (vagas.length === 0) {
      return [];
    }

    // A agenda do médico no intervalo das vagas, uma consulta só.
    const ocupados = await this.prisma.plantao.findMany({
      where: {
        medicoExecutanteId: medico.id,
        status: { not: 'CANCELADO' },
        inicio: { lt: new Date(Math.max(...vagas.map((v) => v.fim.getTime()))) },
        fim: { gt: vagas[0]?.inicio ?? agora },
      },
      select: { id: true, inicio: true, fim: true },
    });

    const minhas = await this.prisma.candidatura.findMany({
      where: { medicoId: medico.id, plantaoId: { in: vagas.map((v) => v.id) } },
      select: { id: true, plantaoId: true, status: true },
    });

    const resultado: VagaResponse[] = [];

    for (const v of vagas) {
      const motivo = !medico.verificado
        ? 'Seu CRM ainda não foi conferido pela plataforma'
        : perfil.especialidade !== v.especialidadeExigida
          ? `Exige ${v.especialidadeExigida}`
          : encontrarSobreposicao(v, ocupados) !== null
            ? 'Conflita com outro plantão da sua agenda'
            : null;

      if (motivo !== null && !todas) {
        continue;
      }

      const minha = minhas.find((c) => c.plantaoId === v.id);
      resultado.push({
        plantao: this.escala.paraResposta(v),
        compativel: motivo === null,
        motivo,
        minhaCandidatura: minha === undefined ? null : { id: minha.id, status: minha.status },
      });
    }

    return resultado;
  }

  /** O médico se candidata (DEC-135). RN02 e RN03 valem aqui, não só na escala. */
  async candidatar(plantaoId: string, usuario: UsuarioAutenticado): Promise<VagaResponse> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    const plantao = await this.exigirVagaAberta(plantaoId);

    if (!medico.verificado) {
      throw new MedicoNaoVerificadoError();
    }
    const perfil = await this.prisma.medico.findUniqueOrThrow({
      where: { id: medico.id },
      select: { especialidade: true, usuario: { select: { nome: true } } },
    });
    if (perfil.especialidade !== plantao.especialidadeExigida) {
      throw new RequisitosNaoAtendidosError([plantao.especialidadeExigida]);
    }
    await this.escala.exigirAgendaLivre(medico.id, plantao);

    const existente = await this.prisma.candidatura.findUnique({
      where: { plantaoId_medicoId: { plantaoId, medicoId: medico.id } },
    });
    // Recusada é resposta dada; insistir não a muda. Retirada pode voltar.
    if (existente !== null && existente.status !== 'RETIRADA') {
      if (existente.status === 'PENDENTE') {
        return this.vagaDoMedico(plantaoId, medico.id);
      }
      throw new CandidaturaJaRespondidaError();
    }

    const inst = plantao.escala.setor.unidade.instituicao;

    await this.prisma.$transaction(async (tx) => {
      const c = await tx.candidatura.upsert({
        where: { plantaoId_medicoId: { plantaoId, medicoId: medico.id } },
        create: { plantaoId, medicoId: medico.id },
        update: { status: 'PENDENTE', respondidaEm: null, criadaEm: new Date() },
      });
      await this.auditoria.registrar(
        {
          acao: 'CANDIDATURA_ENVIADA',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId: usuario.id,
          payload: { candidaturaId: c.id, medicoId: medico.id },
        },
        tx,
      );
      await this.notificacoes.notificar(tx, [{ chefiasDe: inst.id }], {
        tipo: 'CANDIDATURA_RECEBIDA',
        titulo: 'Nova candidatura',
        corpo: `${perfil.usuario.nome} se candidatou para ${descricao(plantao)}.`,
        link: `/instituicao/${inst.id}/escala`,
        entidade: 'Plantao',
        entidadeId: plantaoId,
      });
    });

    return this.vagaDoMedico(plantaoId, medico.id);
  }

  async retirarCandidatura(candidaturaId: string, usuario: UsuarioAutenticado): Promise<void> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    const c = await this.prisma.candidatura.findUnique({ where: { id: candidaturaId } });

    // De outra pessoa responde como inexistente (ADR-026).
    if (c === null || c.medicoId !== medico.id) {
      throw new CandidaturaNaoEncontradaError();
    }
    if (c.status !== 'PENDENTE') {
      throw new CandidaturaJaRespondidaError();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.candidatura.update({
        where: { id: candidaturaId },
        data: { status: 'RETIRADA', respondidaEm: new Date() },
      });
      await this.auditoria.registrar(
        {
          acao: 'CANDIDATURA_RETIRADA',
          entidade: 'Plantao',
          entidadeId: c.plantaoId,
          atorId: usuario.id,
          payload: { candidaturaId },
        },
        tx,
      );
    });
  }

  /** O convidado da vez aceita; a vaga se confirma direto (DEC-135). */
  async aceitarConvite(plantaoId: string, usuario: UsuarioAutenticado): Promise<PlantaoResponse> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);

    // Vence o convite com prazo passado antes de olhar de quem é a vez (DEC-097).
    await this.fila.avancarVaga(plantaoId);

    const convite = await this.prisma.convite.findFirst({
      where: { plantaoId, repasseId: null, medicoId: medico.id, status: 'ATIVO' },
    });
    if (convite === null) {
      throw new NaoEhConvidadoDaVezError();
    }

    const plantao = await this.escala.buscarPlantao(plantaoId);
    const inst = plantao.escala.setor.unidade.instituicao;
    const nome = await this.nomeDoMedico(medico.id);

    const resposta = await this.atribuicao.escalarMedico(plantaoId, medico.id, usuario.id, {
      // Ele mesmo aceitou: avisá-lo de que foi escalado seria eco.
      avisarMedico: false,
      dentroDaTransacao: async (tx) => {
        await tx.convite.update({
          where: { id: convite.id },
          data: { status: 'ACEITO', respondidoEm: new Date() },
        });
        await this.auditoria.registrar(
          {
            acao: 'CONVITE_DA_VAGA_ACEITO',
            entidade: 'Plantao',
            entidadeId: plantaoId,
            atorId: usuario.id,
            estadoAnterior: 'ATIVO',
            estadoNovo: 'ACEITO',
            payload: { ordem: convite.ordem },
          },
          tx,
        );
        await this.fecharSelecao(tx, plantao, medico.id);
        await this.notificacoes.notificar(tx, [{ chefiasDe: inst.id }], {
          tipo: 'VAGA_PREENCHIDA',
          titulo: 'Vaga preenchida',
          corpo: `${nome} aceitou o convite para ${descricao(plantao)}. A escala foi atualizada.`,
          link: `/instituicao/${inst.id}/escala`,
          entidade: 'Plantao',
          entidadeId: plantaoId,
        });
      },
    });

    this.fila.cancelarVencimento(convite.id);
    return resposta;
  }

  async recusarConvite(plantaoId: string, usuario: UsuarioAutenticado): Promise<void> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    await this.fila.avancarVaga(plantaoId);

    const convite = await this.prisma.convite.findFirst({
      where: { plantaoId, repasseId: null, medicoId: medico.id, status: 'ATIVO' },
    });
    if (convite === null) {
      throw new NaoEhConvidadoDaVezError();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.convite.update({
        where: { id: convite.id },
        data: { status: 'RECUSADO', respondidoEm: new Date() },
      });
      await this.auditoria.registrar(
        {
          acao: 'CONVITE_RECUSADO',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId: usuario.id,
          estadoAnterior: 'ATIVO',
          estadoNovo: 'RECUSADO',
          payload: { ordem: convite.ordem },
        },
        tx,
      );
    });

    this.fila.cancelarVencimento(convite.id);
    await this.fila.avancarVaga(plantaoId);
  }

  // --- lado da instituição ----------------------------------------------------

  /**
   * Convida pela fila: os indicados entram no fim, na ordem; sem indicação, o
   * matching chama. Com a fila parada, a vaga passa a EM_SELECAO.
   */
  async convidar(
    plantaoId: string,
    usuario: UsuarioAutenticado,
    indicados: readonly string[],
  ): Promise<PlantaoResponse> {
    const plantao = await this.daInstituicao(plantaoId, usuario);
    await this.instituicao.exigirAtiva(plantao.escala.setor.unidade.instituicaoId);
    this.exigirAberta(plantao);

    await this.fila.validarIndicados(plantao, null, indicados);

    await this.prisma.$transaction(async (tx) => {
      await this.fila.enfileirar(tx, { plantaoId, repasseId: null }, indicados, 'INDICACAO');

      if (plantao.status === 'ABERTO') {
        const { count } = await tx.plantao.updateMany({
          where: { id: plantaoId, status: 'ABERTO' },
          data: { status: 'EM_SELECAO' },
        });
        if (count === 0) {
          throw new VagaNaoAbertaError();
        }
      }

      await this.auditoria.registrar(
        {
          acao: 'CONVITES_DA_VAGA',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId: usuario.id,
          estadoAnterior: plantao.status,
          estadoNovo: 'EM_SELECAO',
          payload: {
            forma: indicados.length > 0 ? 'INDICACAO' : 'MATCHING',
            indicados: indicados.length,
          },
        },
        tx,
      );
    });

    await this.fila.avancarVaga(plantaoId);
    return this.resposta(plantaoId);
  }

  /** A chefia para a fila sem preencher a vaga; ela volta a ABERTO. */
  async encerrarConvites(plantaoId: string, usuario: UsuarioAutenticado): Promise<PlantaoResponse> {
    const plantao = await this.daInstituicao(plantaoId, usuario);

    if (plantao.status !== 'EM_SELECAO') {
      throw new VagaNaoAbertaError('Não há convites em andamento para esta vaga');
    }

    const ativos = await this.prisma.$transaction(async (tx) => {
      const cancelados = await this.fila.cancelarConvites(tx, { plantaoId, repasseId: null });
      await tx.plantao.update({ where: { id: plantaoId }, data: { status: 'ABERTO' } });
      await this.auditoria.registrar(
        {
          acao: 'FILA_DA_VAGA_ENCERRADA',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId: usuario.id,
          estadoAnterior: 'EM_SELECAO',
          estadoNovo: 'ABERTO',
          payload: { motivo: 'encerrada pela instituição' },
        },
        tx,
      );
      await this.avisarConviteCancelado(tx, plantao, cancelados);
      return cancelados;
    });

    for (const c of ativos) this.fila.cancelarVencimento(c.id);
    return this.resposta(plantaoId);
  }

  async filaDaVaga(plantaoId: string, usuario: UsuarioAutenticado): Promise<ConviteResponse[]> {
    await this.daInstituicao(plantaoId, usuario);
    const convites = await this.prisma.convite.findMany({
      where: { plantaoId, repasseId: null },
      include: { medico: { include: { usuario: { select: { nome: true } } } } },
      orderBy: { ordem: 'asc' },
    });
    return convites.map((c) => ({
      id: c.id,
      ordem: c.ordem,
      origem: c.origem,
      status: c.status,
      medico: {
        id: c.medico.id,
        nome: c.medico.usuario.nome,
        crm: c.medico.crm,
        crmUf: c.medico.crmUf,
      },
      prazoAte: c.prazoAte?.toISOString() ?? null,
      respondidoEm: c.respondidoEm?.toISOString() ?? null,
    }));
  }

  async candidaturas(
    plantaoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<CandidaturaResponse[]> {
    await this.daInstituicao(plantaoId, usuario);
    const lista = await this.prisma.candidatura.findMany({
      where: { plantaoId },
      include: { medico: { include: { usuario: { select: { nome: true } } } } },
      orderBy: { criadaEm: 'asc' },
    });
    return lista.map((c) => ({
      id: c.id,
      status: c.status,
      medico: {
        id: c.medico.id,
        nome: c.medico.usuario.nome,
        crm: c.medico.crm,
        crmUf: c.medico.crmUf,
        especialidade: c.medico.especialidade,
      },
      criadaEm: c.criadaEm.toISOString(),
    }));
  }

  /** A chefia escolhe um candidato: ele é escalado (DEC-135). */
  async aceitarCandidatura(
    candidaturaId: string,
    usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    const c = await this.candidaturaDaInstituicao(candidaturaId, usuario);
    const plantao = await this.escala.buscarPlantao(c.plantaoId);
    this.exigirAberta(plantao);

    const ativos: { id: string }[] = [];
    const resposta = await this.atribuicao.escalarMedico(c.plantaoId, c.medicoId, usuario.id, {
      instituicoesDoAtor: instituicoesComPerfil(usuario, ...PAPEIS_DA_VAGA),
      // O aviso dele é o da candidatura, que diz mais que "você foi escalado".
      avisarMedico: false,
      dentroDaTransacao: async (tx) => {
        ativos.push(...(await this.fecharSelecao(tx, plantao, c.medicoId)));
        await this.notificacoes.notificar(tx, [{ medicoId: c.medicoId }], {
          tipo: 'CANDIDATURA_ACEITA',
          titulo: 'Candidatura escolhida',
          corpo: `A instituição escolheu você para ${descricao(plantao)}. O plantão já está na sua escala.`,
          link: '/escala',
          entidade: 'Plantao',
          entidadeId: c.plantaoId,
        });
      },
    });

    for (const a of ativos) this.fila.cancelarVencimento(a.id);
    return resposta;
  }

  async recusarCandidatura(candidaturaId: string, usuario: UsuarioAutenticado): Promise<void> {
    const c = await this.candidaturaDaInstituicao(candidaturaId, usuario);
    if (c.status !== 'PENDENTE') {
      throw new CandidaturaJaRespondidaError();
    }
    const plantao = await this.escala.buscarPlantao(c.plantaoId);

    await this.prisma.$transaction(async (tx) => {
      await tx.candidatura.update({
        where: { id: candidaturaId },
        data: { status: 'RECUSADA', respondidaEm: new Date() },
      });
      await this.auditoria.registrar(
        {
          acao: 'CANDIDATURA_RECUSADA',
          entidade: 'Plantao',
          entidadeId: c.plantaoId,
          atorId: usuario.id,
          payload: { candidaturaId, medicoId: c.medicoId },
        },
        tx,
      );
      await this.notificacoes.notificar(tx, [{ medicoId: c.medicoId }], {
        tipo: 'CANDIDATURA_RECUSADA',
        titulo: 'Candidatura não escolhida',
        corpo: `A instituição não escolheu sua candidatura para ${descricao(plantao)}.`,
        link: '/disponibilidade',
        entidade: 'Plantao',
        entidadeId: c.plantaoId,
      });
    });
  }

  /** Escalar direto (DEC-052) — a mesma rota de antes, agora fechando a seleção. */
  async escalarDireto(
    plantaoId: string,
    medicoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    const plantao = await this.escala.buscarPlantao(plantaoId);
    const ativos: { id: string }[] = [];

    const resposta = await this.atribuicao.escalarMedico(plantaoId, medicoId, usuario.id, {
      instituicoesDoAtor: instituicoesComPerfil(usuario, ...PAPEIS_DA_VAGA),
      dentroDaTransacao: async (tx) => {
        ativos.push(...(await this.fecharSelecao(tx, plantao, medicoId)));
      },
    });

    for (const a of ativos) this.fila.cancelarVencimento(a.id);
    return resposta;
  }

  // --- internos ---------------------------------------------------------------

  /**
   * A vaga foi preenchida — por quem quer que seja. Para a fila, encerra as
   * candidaturas pendentes (a do escolhido vira ACEITA) e avisa quem esperava.
   * Roda dentro da transação da atribuição. Devolve os convites que estavam
   * ativos, para cancelar o job depois do commit.
   */
  private async fecharSelecao(
    tx: Tx,
    plantao: PlantaoCompleto,
    escolhidoId: string,
  ): Promise<{ id: string; medicoId: string }[]> {
    const ativos = await this.fila.cancelarConvites(tx, { plantaoId: plantao.id, repasseId: null });
    await this.avisarConviteCancelado(
      tx,
      plantao,
      ativos.filter((a) => a.medicoId !== escolhidoId),
    );

    const pendentes = await tx.candidatura.findMany({
      where: { plantaoId: plantao.id, status: 'PENDENTE' },
      select: { id: true, medicoId: true },
    });
    const agora = new Date();

    for (const c of pendentes) {
      const escolhido = c.medicoId === escolhidoId;
      await tx.candidatura.update({
        where: { id: c.id },
        data: { status: escolhido ? 'ACEITA' : 'ENCERRADA', respondidaEm: agora },
      });
      if (!escolhido) {
        await this.notificacoes.notificar(tx, [{ medicoId: c.medicoId }], {
          tipo: 'CANDIDATURA_ENCERRADA',
          titulo: 'Vaga preenchida',
          corpo: `A vaga ${descricao(plantao)} foi preenchida por outra pessoa.`,
          link: '/disponibilidade',
          entidade: 'Plantao',
          entidadeId: plantao.id,
        });
      }
    }

    return ativos;
  }

  private async avisarConviteCancelado(
    tx: Tx,
    plantao: PlantaoCompleto,
    convidados: readonly { medicoId: string }[],
  ): Promise<void> {
    await this.notificacoes.notificar(
      tx,
      convidados.map((c) => ({ medicoId: c.medicoId })),
      {
        tipo: 'CONVITE_CANCELADO',
        titulo: 'Convite cancelado',
        corpo: `O convite para ${descricao(plantao)} não vale mais: a vaga foi preenchida ou os convites foram encerrados.`,
        entidade: 'Plantao',
        entidadeId: plantao.id,
      },
    );
  }

  private async exigirVagaAberta(plantaoId: string): Promise<PlantaoCompleto> {
    const plantao = await this.escala.buscarPlantao(plantaoId);
    this.exigirAberta(plantao);
    if (plantao.escala.setor.unidade.instituicao.status !== 'ATIVA') {
      throw new VagaNaoAbertaError();
    }
    return plantao;
  }

  private exigirAberta(plantao: PlantaoCompleto): void {
    if (plantao.status !== 'ABERTO' && plantao.status !== 'EM_SELECAO') {
      throw new VagaNaoAbertaError();
    }
    if (plantao.inicio <= new Date()) {
      throw new VagaNaoAbertaError('O plantão já começou');
    }
  }

  private async daInstituicao(
    plantaoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<PlantaoCompleto> {
    const plantao = await this.escala.buscarPlantao(plantaoId);
    this.instituicao.exigirPapel(
      usuario,
      plantao.escala.setor.unidade.instituicaoId,
      ...PAPEIS_DA_VAGA,
    );
    return plantao;
  }

  private async candidaturaDaInstituicao(candidaturaId: string, usuario: UsuarioAutenticado) {
    const c = await this.prisma.candidatura.findUnique({
      where: { id: candidaturaId },
      include: {
        plantao: {
          select: { escala: { select: { setor: { select: { unidade: true } } } } },
        },
      },
    });
    if (c === null) {
      throw new CandidaturaNaoEncontradaError();
    }
    this.instituicao.exigirPapel(
      usuario,
      c.plantao.escala.setor.unidade.instituicaoId,
      ...PAPEIS_DA_VAGA,
    );
    return c;
  }

  private async vagaDoMedico(plantaoId: string, medicoId: string): Promise<VagaResponse> {
    const plantao = await this.escala.buscarPlantao(plantaoId);
    const c = await this.prisma.candidatura.findUnique({
      where: { plantaoId_medicoId: { plantaoId, medicoId } },
      select: { id: true, status: true },
    });
    return {
      plantao: this.escala.paraResposta(plantao),
      compativel: true,
      motivo: null,
      minhaCandidatura: c,
    };
  }

  private async nomeDoMedico(medicoId: string): Promise<string> {
    const m = await this.prisma.medico.findUniqueOrThrow({
      where: { id: medicoId },
      select: { usuario: { select: { nome: true } } },
    });
    return m.usuario.nome;
  }

  private async resposta(plantaoId: string): Promise<PlantaoResponse> {
    return this.escala.paraResposta(await this.escala.buscarPlantao(plantaoId), {
      comSelecao: true,
    });
  }
}
