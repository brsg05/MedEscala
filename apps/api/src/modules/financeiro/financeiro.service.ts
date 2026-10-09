import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PernaPagamento, Prisma } from '@prisma/client';
import {
  calcularRetencoes,
  formatarCentavos,
  type FinanceiroResponse,
  type LinhaDeRetencao,
  type UsuarioAutenticado,
} from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  DocumentoFiscalNaoEmissivelError,
  SemAcessoAoRecursoError,
} from '../../shared/errors/dominio-negocio.error';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EMISSOR_DE_NFSE, type EmissorDeNfse } from '../integracoes/emissor-nfse';
import { GATEWAY_DE_PAGAMENTO, type GatewayDePagamento } from '../integracoes/gateway-de-pagamento';
import { NotificacaoService } from '../notificacao/notificacao.service';
import { descreverPlantao } from '../notificacao/textos';
import { registroDeCnpj, registroDeCrm } from '../termos/domain/conteudo';

type Tx = Prisma.TransactionClient;

type Pagadora = { instituicaoId: string } | { medicoId: string };

/**
 * F14, F15 e F17 — garantia, split e NFS-e, sobre adaptadores simulados
 * (DEC-122, DEC-204).
 *
 * O ciclo de uma perna de pagamento (DEC-201, DEC-202):
 *
 *   PRE_AUTORIZADO  no aceite — a instituição (ou o titular, no modelo B) reserva o valor
 *   RETIDO          plantão cumprido — capturado; nasce o rascunho da NFS-e
 *   LIBERADO        prazo de contestação encerrado E nota emitida (o banco confere)
 *
 * e as saídas: CANCELADO (reserva desfeita antes de cumprir) e ESTORNADO
 * (contestação procedente, DEC-191).
 *
 * Global, como termos e auditoria: cada passo acontece DENTRO da transação de
 * outro módulo (escalar, aprovar repasse, check-out, resolver contestação). As
 * chamadas ao gateway e ao emissor também — aceitável com o adaptador simulado,
 * que não falha; com o real, viram outbox (DEC-208).
 */
@Injectable()
export class FinanceiroService {
  private readonly logger = new Logger(FinanceiroService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly notificacoes: NotificacaoService,
    @Inject(GATEWAY_DE_PAGAMENTO) private readonly gateway: GatewayDePagamento,
    @Inject(EMISSOR_DE_NFSE) private readonly emissor: EmissorDeNfse,
  ) {}

  // --- ganchos chamados pelos outros módulos -----------------------------------

  /** Médico escalado (qualquer caminho da F10): a instituição reserva o valor (F15). */
  async aoEscalar(tx: Tx, plantaoId: string, medicoId: string): Promise<void> {
    const instituicaoId = await this.instituicaoDo(tx, plantaoId);
    await this.preAutorizar(tx, plantaoId, 'PRINCIPAL', medicoId, { instituicaoId });
  }

  /**
   * Repasse aprovado. Modelo A: a reserva do titular cai e a instituição
   * reserva para o substituto. Modelo B (DEC-203): a do titular fica — ele
   * segue contratado pela instituição — e o titular reserva para o substituto.
   */
  async aoAprovarRepasse(
    tx: Tx,
    r: { plantaoId: string; modeloFiscal: string; titularId: string; substitutoId: string },
  ): Promise<void> {
    if (r.modeloFiscal === 'B_SUBCONTRATACAO') {
      await this.cancelarReservas(tx, r.plantaoId, 'SUBCONTRATACAO');
      await this.preAutorizar(tx, r.plantaoId, 'SUBCONTRATACAO', r.substitutoId, {
        medicoId: r.titularId,
      });
      return;
    }
    await this.cancelarReservas(tx, r.plantaoId, null);
    const instituicaoId = await this.instituicaoDo(tx, r.plantaoId);
    await this.preAutorizar(tx, r.plantaoId, 'PRINCIPAL', r.substitutoId, { instituicaoId });
  }

  /**
   * Plantão cumprido: captura cada perna reservada, calcula as retenções pela
   * regra do dia (DEC-205) e prepara o rascunho da NFS-e, que o médico emite com
   * um toque (DEC-202). `liberavelEm` é quando a plataforma emite por ele, se
   * ainda não tiver emitido, e libera.
   */
  async aoCumprir(
    tx: Tx,
    plantaoId: string,
    agora: Date,
    contestavelAte: Date | null,
  ): Promise<void> {
    const pernas = await tx.pagamento.findMany({
      where: { plantaoId, status: 'PRE_AUTORIZADO' },
    });
    if (pernas.length === 0) {
      return;
    }

    const plantao = await this.plantaoCompleto(tx, plantaoId);
    const inst = plantao.escala.setor.unidade.instituicao;
    const liberavelEm =
      contestavelAte ?? new Date(agora.getTime() + inst.prazoContestacaoHoras * 3_600_000);

    for (const perna of pernas) {
      await this.gateway.capturar(perna.referenciaGateway);

      const partes = await this.partes(tx, perna, inst);
      const r = this.retencoes(perna, partes, inst.issRetidoBp, plantao.modeloContratacao, agora);

      await tx.pagamento.update({
        where: { id: perna.id },
        data: {
          status: 'RETIDO',
          retidoEm: agora,
          liberavelEm,
          retidoCentavos: r.retidoCentavos,
          liquidoCentavos:
            perna.valorBrutoCentavos - r.retidoCentavos - perna.taxaPlataformaCentavos,
        },
      });

      await tx.documentoFiscal.create({
        data: {
          pagamentoId: perna.id,
          prestadorMedicoId: perna.beneficiarioMedicoId,
          prestadorNome: partes.prestador.nome,
          prestadorRegistro: partes.prestador.registro,
          tomadorNome: partes.tomador.nome,
          tomadorRegistro: partes.tomador.registro,
          discriminacao: `Serviço médico em ${plantao.especialidadeExigida} — plantão de ${descreverPlantao(
            {
              setor: plantao.escala.setor.nome,
              unidade: plantao.escala.setor.unidade.nome,
              inicio: plantao.inicio,
            },
          )}${perna.perna === 'SUBCONTRATACAO' ? ', em subcontratação (modelo B)' : ''}.`,
          valorServicoCentavos: perna.valorBrutoCentavos,
          retencoes: r.linhas as unknown as Prisma.InputJsonValue,
          observacoes: r.observacoes,
          valorLiquidoCentavos: perna.valorBrutoCentavos - r.retidoCentavos,
        },
      });

      await this.auditoria.registrar(
        {
          acao: 'PAGAMENTO_RETIDO',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          estadoAnterior: 'PRE_AUTORIZADO',
          estadoNovo: 'RETIDO',
          payload: { pagamentoId: perna.id, perna: perna.perna, retidoCentavos: r.retidoCentavos },
        },
        tx,
      );

      await this.notificacoes.notificar(tx, [{ medicoId: perna.beneficiarioMedicoId }], {
        tipo: 'NFSE_PRONTA_PARA_EMITIR',
        titulo: 'NFS-e pronta para emitir',
        corpo: `O rascunho da nota de ${formatarCentavos(perna.valorBrutoCentavos)} está pronto, com as retenções calculadas. Emita com um toque; se não emitir até ${liberavelEm.toLocaleDateString('pt-BR', { timeZone: 'America/Recife' })}, a plataforma emite por você.`,
        link: '/escala',
        entidade: 'Plantao',
        entidadeId: plantaoId,
      });
    }
  }

  /**
   * Contestação improcedente: o plantão foi cumprido. Se a cobrança nunca foi
   * capturada (plantão sem confirmação, DEC-131), captura agora; se já estava
   * retida, a liberação espera ao menos até agora.
   */
  async aoContestacaoImprocedente(tx: Tx, plantaoId: string, agora: Date): Promise<void> {
    await this.aoCumprir(tx, plantaoId, agora, agora);
    await tx.pagamento.updateMany({
      where: { plantaoId, status: 'RETIDO', liberavelEm: { lt: agora } },
      data: { liberavelEm: agora },
    });
  }

  /** Contestação procedente: estorno integral à pagadora; nota cancelada (DEC-191). */
  async aoContestacaoProcedente(tx: Tx, plantaoId: string, agora: Date): Promise<void> {
    const pernas = await tx.pagamento.findMany({
      where: { plantaoId, status: { in: ['PRE_AUTORIZADO', 'RETIDO'] } },
      include: { documentoFiscal: true },
    });

    for (const perna of pernas) {
      if (perna.status === 'RETIDO') {
        await this.gateway.estornar(perna.referenciaGateway);
        await tx.pagamento.update({
          where: { id: perna.id },
          data: { status: 'ESTORNADO', estornadoEm: agora },
        });
      } else {
        await this.gateway.cancelar(perna.referenciaGateway);
        await tx.pagamento.update({
          where: { id: perna.id },
          data: { status: 'CANCELADO', canceladoEm: agora },
        });
      }

      const doc = perna.documentoFiscal;
      if (doc !== null && doc.status !== 'CANCELADA') {
        if (doc.status === 'EMITIDA' && doc.numero !== null) {
          await this.emissor.cancelar(doc.numero);
        }
        await tx.documentoFiscal.update({
          where: { id: doc.id },
          data: { status: 'CANCELADA', canceladaEm: agora },
        });
      }

      await this.auditoria.registrar(
        {
          acao: perna.status === 'RETIDO' ? 'PAGAMENTO_ESTORNADO' : 'PAGAMENTO_CANCELADO',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          estadoAnterior: perna.status,
          estadoNovo: perna.status === 'RETIDO' ? 'ESTORNADO' : 'CANCELADO',
          payload: { pagamentoId: perna.id, perna: perna.perna },
        },
        tx,
      );

      if (perna.status === 'RETIDO' && perna.pagadorInstituicaoId !== null) {
        await this.notificacoes.notificar(tx, [{ adminsDe: perna.pagadorInstituicaoId }], {
          tipo: 'PAGAMENTO_ESTORNADO',
          titulo: 'Pagamento estornado',
          corpo: `Contestação procedente: ${formatarCentavos(perna.valorBrutoCentavos - perna.retidoCentavos)} voltaram para a instituição.`,
          link: `/instituicao/${perna.pagadorInstituicaoId}/escala`,
          entidade: 'Plantao',
          entidadeId: plantaoId,
        });
      }
    }
  }

  // --- toque do médico e varredura ---------------------------------------------

  /** DEC-202 — o médico emite a NFS-e do rascunho, sem sair do app. */
  async emitirNfse(documentoId: string, usuario: UsuarioAutenticado): Promise<FinanceiroResponse> {
    const doc = await this.prisma.documentoFiscal.findUnique({
      where: { id: documentoId },
      include: { pagamento: { include: { plantao: { select: { id: true, status: true } } } } },
    });
    const medico = await this.prisma.medico.findUnique({
      where: { usuarioId: usuario.id },
      select: { id: true },
    });

    // A nota é do prestador; para os demais, ela não existe (ADR-026).
    if (doc === null || medico === null || doc.prestadorMedicoId !== medico.id) {
      throw new SemAcessoAoRecursoError();
    }
    if (doc.status !== 'RASCUNHO') {
      throw new DocumentoFiscalNaoEmissivelError('Esta nota já foi emitida ou cancelada');
    }
    if (doc.pagamento.plantao.status !== 'EXECUTADO') {
      throw new DocumentoFiscalNaoEmissivelError(
        'A nota só pode ser emitida com o plantão cumprido e fora de contestação',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.emitir(tx, doc.id, 'MEDICO', usuario.id);
    });

    return this.doPlantao(doc.pagamento.plantao.id, usuario);
  }

  /**
   * Fim do prazo: emite a nota que o médico não emitiu (DEC-202), libera o
   * líquido (F17) e, com todas as pernas liberadas, liquida o plantão. Roda no
   * job recorrente e nas leituras — "Postgres decide, Redis acelera" (DEC-097).
   */
  async varrerLiberacoes(agora: Date = new Date()): Promise<void> {
    const prontos = await this.prisma.pagamento.findMany({
      where: { status: 'RETIDO', liberavelEm: { lte: agora }, plantao: { status: 'EXECUTADO' } },
      select: { id: true, plantaoId: true },
    });

    for (const { id, plantaoId } of prontos) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM pagamento WHERE id = ${id}::uuid FOR UPDATE`;
          const p = await tx.pagamento.findUniqueOrThrow({
            where: { id },
            include: { documentoFiscal: true },
          });
          if (p.status !== 'RETIDO') return;

          if (p.documentoFiscal?.status === 'RASCUNHO') {
            await this.emitir(tx, p.documentoFiscal.id, 'AUTOMATICA', null);
          }

          await this.gateway.liberar({
            referencia: p.referenciaGateway,
            liquidoCentavos: p.liquidoCentavos,
            taxaPlataformaCentavos: p.taxaPlataformaCentavos,
          });
          // O trigger `pagamento_libera_so_com_nota` confere a nota (F17).
          await tx.pagamento.update({
            where: { id },
            data: { status: 'LIBERADO', liberadoEm: agora },
          });
          await this.auditoria.registrar(
            {
              acao: 'PAGAMENTO_LIBERADO',
              entidade: 'Plantao',
              entidadeId: plantaoId,
              estadoAnterior: 'RETIDO',
              estadoNovo: 'LIBERADO',
              payload: { pagamentoId: id, perna: p.perna, liquidoCentavos: p.liquidoCentavos },
            },
            tx,
          );
          await this.notificacoes.notificar(tx, [{ medicoId: p.beneficiarioMedicoId }], {
            tipo: 'PAGAMENTO_LIBERADO',
            titulo: 'Pagamento liberado',
            corpo: `${formatarCentavos(p.liquidoCentavos)} liberados para você (valor do plantão menos as retenções na fonte).`,
            link: '/escala',
            entidade: 'Plantao',
            entidadeId: plantaoId,
          });

          const pendentes = await tx.pagamento.count({
            where: { plantaoId, status: { in: ['PRE_AUTORIZADO', 'RETIDO'] } },
          });
          if (pendentes === 0) {
            const { count } = await tx.plantao.updateMany({
              where: { id: plantaoId, status: 'EXECUTADO' },
              data: { status: 'LIQUIDADO' },
            });
            if (count > 0) {
              await this.auditoria.registrar(
                {
                  acao: 'PLANTAO_LIQUIDADO',
                  entidade: 'Plantao',
                  entidadeId: plantaoId,
                  estadoAnterior: 'EXECUTADO',
                  estadoNovo: 'LIQUIDADO',
                },
                tx,
              );
            }
          }
        });
      } catch (erro) {
        // Uma perna com problema não segura as outras; a próxima varredura tenta de novo.
        this.logger.warn(`Liberação do pagamento ${id} falhou: ${String(erro)}`);
      }
    }
  }

  // --- leitura ----------------------------------------------------------------

  /**
   * O financeiro de um plantão, visto por quem participa: cada médico vê as
   * pernas em que paga ou recebe; a instituição vê a perna principal. A perna
   * B é entre médicos (DEC-209).
   */
  async doPlantao(plantaoId: string, usuario: UsuarioAutenticado): Promise<FinanceiroResponse> {
    await this.varrerLiberacoes();

    const plantao = await this.prisma.plantao.findUnique({
      where: { id: plantaoId },
      select: {
        status: true,
        escala: { select: { setor: { select: { unidade: { select: { instituicaoId: true } } } } } },
      },
    });
    if (plantao === null) {
      throw new SemAcessoAoRecursoError();
    }

    const instituicaoId = plantao.escala.setor.unidade.instituicaoId;
    const daInstituicao = usuario.perfis.some(
      (x) =>
        x.instituicaoId === instituicaoId &&
        (x.perfil === 'ADMIN_INSTITUICAO' || x.perfil === 'CHEFIA_ESCALA'),
    );
    const medico = await this.prisma.medico.findUnique({
      where: { usuarioId: usuario.id },
      select: { id: true },
    });

    const pernas = await this.prisma.pagamento.findMany({
      where: { plantaoId },
      include: {
        documentoFiscal: true,
        plantao: { select: { status: true } },
      },
      orderBy: { preAutorizadoEm: 'asc' },
    });

    const visiveis = pernas.filter(
      (p) =>
        (daInstituicao && p.perna === 'PRINCIPAL') ||
        (medico !== null &&
          (p.beneficiarioMedicoId === medico.id || p.pagadorMedicoId === medico.id)),
    );

    // Quem não paga, não recebe e não é da instituição: o financeiro não existe (ADR-026).
    if (visiveis.length === 0 && !daInstituicao) {
      throw new SemAcessoAoRecursoError();
    }

    const nomes = await this.nomesDosMedicos([
      ...visiveis.map((p) => p.beneficiarioMedicoId),
      ...visiveis.flatMap((p) => (p.pagadorMedicoId === null ? [] : [p.pagadorMedicoId])),
    ]);
    const instituicao = await this.prisma.instituicao.findUniqueOrThrow({
      where: { id: instituicaoId },
      select: { nome: true },
    });

    return {
      pernas: visiveis.map((p) => {
        const doc = p.documentoFiscal;
        return {
          id: p.id,
          perna: p.perna,
          status: p.status,
          pagador:
            p.pagadorMedicoId === null ? instituicao.nome : (nomes.get(p.pagadorMedicoId) ?? '—'),
          beneficiario: nomes.get(p.beneficiarioMedicoId) ?? '—',
          valorBrutoCentavos: p.valorBrutoCentavos,
          retidoCentavos: p.retidoCentavos,
          taxaPlataformaCentavos: p.taxaPlataformaCentavos,
          liquidoCentavos: p.liquidoCentavos,
          preAutorizadoEm: p.preAutorizadoEm.toISOString(),
          retidoEm: p.retidoEm?.toISOString() ?? null,
          liberavelEm: p.liberavelEm?.toISOString() ?? null,
          liberadoEm: p.liberadoEm?.toISOString() ?? null,
          documentoFiscal:
            doc === null
              ? null
              : {
                  id: doc.id,
                  status: doc.status,
                  prestadorNome: doc.prestadorNome,
                  prestadorRegistro: doc.prestadorRegistro,
                  tomadorNome: doc.tomadorNome,
                  tomadorRegistro: doc.tomadorRegistro,
                  discriminacao: doc.discriminacao,
                  valorServicoCentavos: doc.valorServicoCentavos,
                  retencoes: doc.retencoes as unknown as LinhaDeRetencao[],
                  observacoes: doc.observacoes,
                  valorLiquidoCentavos: doc.valorLiquidoCentavos,
                  numero: doc.numero,
                  codigoVerificacao: doc.codigoVerificacao,
                  emitidaEm: doc.emitidaEm?.toISOString() ?? null,
                  emitidaPor: doc.emitidaPor,
                  podeEmitir:
                    medico !== null &&
                    doc.prestadorMedicoId === medico.id &&
                    doc.status === 'RASCUNHO' &&
                    p.plantao.status === 'EXECUTADO',
                },
        };
      }),
    };
  }

  // --- internos ---------------------------------------------------------------

  private async preAutorizar(
    tx: Tx,
    plantaoId: string,
    perna: PernaPagamento,
    beneficiarioMedicoId: string,
    pagadora: Pagadora,
  ): Promise<void> {
    const plantao = await this.plantaoCompleto(tx, plantaoId);
    const inst = plantao.escala.setor.unidade.instituicao;
    const valor = plantao.valorCentavos;

    // Estimativa da reserva: o que passa pela plataforma é o bruto menos o que a
    // pagadora retém e recolhe (F17). Recalculado na captura, pela regra do dia.
    const stub = {
      perna,
      beneficiarioMedicoId,
      pagadorMedicoId: 'medicoId' in pagadora ? pagadora.medicoId : null,
      valorBrutoCentavos: valor,
    };
    const partes = await this.partes(tx, stub, inst);
    const r = this.retencoes(stub, partes, inst.issRetidoBp, plantao.modeloContratacao, new Date());
    const taxa = 0; // DEC-190

    const { referencia } = await this.gateway.preAutorizar({
      valorCentavos: valor - r.retidoCentavos + taxa,
      descricao: `Plantão ${plantaoId} — ${perna}`,
    });

    await tx.pagamento.create({
      data: {
        plantaoId,
        perna,
        pagadorInstituicaoId: 'instituicaoId' in pagadora ? pagadora.instituicaoId : null,
        pagadorMedicoId: 'medicoId' in pagadora ? pagadora.medicoId : null,
        beneficiarioMedicoId,
        valorBrutoCentavos: valor,
        retidoCentavos: r.retidoCentavos,
        taxaPlataformaCentavos: taxa,
        liquidoCentavos: valor - r.retidoCentavos - taxa,
        referenciaGateway: referencia,
      },
    });

    await this.auditoria.registrar(
      {
        acao: 'PAGAMENTO_PRE_AUTORIZADO',
        entidade: 'Plantao',
        entidadeId: plantaoId,
        estadoNovo: 'PRE_AUTORIZADO',
        payload: { perna, beneficiarioMedicoId, valorCentavos: valor },
      },
      tx,
    );
  }

  /** Desfaz reservas ainda não capturadas — de uma perna, ou de todas. */
  private async cancelarReservas(
    tx: Tx,
    plantaoId: string,
    perna: PernaPagamento | null,
  ): Promise<void> {
    const reservas = await tx.pagamento.findMany({
      where: { plantaoId, status: 'PRE_AUTORIZADO', ...(perna === null ? {} : { perna }) },
    });
    for (const r of reservas) {
      await this.gateway.cancelar(r.referenciaGateway);
      await tx.pagamento.update({
        where: { id: r.id },
        data: { status: 'CANCELADO', canceladoEm: new Date() },
      });
      await this.auditoria.registrar(
        {
          acao: 'PAGAMENTO_CANCELADO',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          estadoAnterior: 'PRE_AUTORIZADO',
          estadoNovo: 'CANCELADO',
          payload: { pagamentoId: r.id, perna: r.perna },
        },
        tx,
      );
    }
  }

  private async emitir(
    tx: Tx,
    documentoId: string,
    por: 'MEDICO' | 'AUTOMATICA',
    atorId: string | null,
  ): Promise<void> {
    const doc = await tx.documentoFiscal.findUniqueOrThrow({
      where: { id: documentoId },
      include: { pagamento: { select: { plantaoId: true } } },
    });
    const emitida = await this.emissor.emitir({
      prestadorRegistro: doc.prestadorRegistro,
      tomadorRegistro: doc.tomadorRegistro,
      valorCentavos: doc.valorServicoCentavos,
      discriminacao: doc.discriminacao,
    });

    const { count } = await tx.documentoFiscal.updateMany({
      where: { id: documentoId, status: 'RASCUNHO' },
      data: {
        status: 'EMITIDA',
        numero: emitida.numero,
        codigoVerificacao: emitida.codigoVerificacao,
        emitidaEm: emitida.emitidaEm,
        emitidaPor: por,
      },
    });
    if (count === 0) {
      return; // outra emissão chegou antes
    }

    await this.auditoria.registrar(
      {
        acao: 'NFSE_EMITIDA',
        entidade: 'Plantao',
        entidadeId: doc.pagamento.plantaoId,
        atorId,
        estadoAnterior: 'RASCUNHO',
        estadoNovo: 'EMITIDA',
        payload: { documentoId, numero: emitida.numero, por, simulada: true },
      },
      tx,
    );

    if (por === 'AUTOMATICA') {
      await this.notificacoes.notificar(tx, [{ medicoId: doc.prestadorMedicoId }], {
        tipo: 'NFSE_EMITIDA',
        titulo: 'NFS-e emitida pela plataforma',
        corpo: `O prazo terminou e a plataforma emitiu a nota ${emitida.numero} em seu nome (simulada).`,
        link: '/escala',
        entidade: 'Plantao',
        entidadeId: doc.pagamento.plantaoId,
      });
    }
  }

  private retencoes(
    perna: { perna: PernaPagamento; valorBrutoCentavos: number },
    partes: Awaited<ReturnType<FinanceiroService['partes']>>,
    issRetidoBp: number | null,
    modeloContratacao: string,
    data: Date,
  ) {
    return calcularRetencoes({
      valorCentavos: perna.valorBrutoCentavos,
      prestador: {
        modelo: modeloContratacao === 'RPA' ? 'RPA' : 'PJ',
        regime: partes.prestador.regime,
      },
      tomadorOptanteDoSimples: partes.tomador.simples,
      // ISS na fonte é obrigação que o município impõe à instituição; na perna B
      // a tomadora é a PJ do titular, e o MVP não modela o município dela.
      issRetidoBp: perna.perna === 'PRINCIPAL' ? issRetidoBp : null,
      data,
    });
  }

  private async partes(
    tx: Tx,
    p: { beneficiarioMedicoId: string; pagadorMedicoId: string | null },
    inst: { nome: string; cnpj: string },
  ) {
    const prestador = await tx.medico.findUniqueOrThrow({
      where: { id: p.beneficiarioMedicoId },
      select: {
        crm: true,
        crmUf: true,
        cnpj: true,
        regimeTributario: true,
        usuario: { select: { nome: true } },
      },
    });
    const registro = (m: { cnpj: string | null; crm: string; crmUf: string }): string =>
      m.cnpj === null ? registroDeCrm(m.crm, m.crmUf) : registroDeCnpj(m.cnpj);

    if (p.pagadorMedicoId === null) {
      return {
        prestador: {
          nome: prestador.usuario.nome,
          registro: registro(prestador),
          regime: prestador.regimeTributario,
        },
        tomador: { nome: inst.nome, registro: registroDeCnpj(inst.cnpj), simples: false },
      };
    }

    const titular = await tx.medico.findUniqueOrThrow({
      where: { id: p.pagadorMedicoId },
      select: {
        crm: true,
        crmUf: true,
        cnpj: true,
        regimeTributario: true,
        usuario: { select: { nome: true } },
      },
    });
    return {
      prestador: {
        nome: prestador.usuario.nome,
        registro: registro(prestador),
        regime: prestador.regimeTributario,
      },
      tomador: {
        nome: titular.usuario.nome,
        registro: registro(titular),
        simples: titular.regimeTributario === 'SIMPLES_NACIONAL',
      },
    };
  }

  private async plantaoCompleto(tx: Tx, plantaoId: string) {
    return tx.plantao.findUniqueOrThrow({
      where: { id: plantaoId },
      include: {
        escala: {
          include: { setor: { include: { unidade: { include: { instituicao: true } } } } },
        },
      },
    });
  }

  private async instituicaoDo(tx: Tx, plantaoId: string): Promise<string> {
    const p = await tx.plantao.findUniqueOrThrow({
      where: { id: plantaoId },
      select: { escala: { select: { setor: { select: { unidade: true } } } } },
    });
    return p.escala.setor.unidade.instituicaoId;
  }

  private async nomesDosMedicos(ids: readonly string[]): Promise<Map<string, string>> {
    const medicos = await this.prisma.medico.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, usuario: { select: { nome: true } } },
    });
    return new Map(medicos.map((m) => [m.id, m.usuario.nome]));
  }
}
