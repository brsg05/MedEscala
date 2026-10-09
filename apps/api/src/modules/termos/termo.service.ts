import { Injectable } from '@nestjs/common';
import type { PapelNoTermo, Prisma } from '@prisma/client';
import type { TermoResponse, UsuarioAutenticado } from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SemAcessoAoRecursoError } from '../../shared/errors/dominio-negocio.error';
import {
  hashDe,
  montarContrato,
  montarSubstituicao,
  PAPEIS_DO_TERMO,
  registroDeCnpj,
  registroDeCrm,
  type ConteudoDoTermo,
  type Parte,
  type PlantaoDoTermo,
} from './domain/conteudo';
import { renderizarTermo } from './pdf';

type Tx = Prisma.TransactionClient;

/** Quem assina e com que ação (DEC-185). */
export interface Aceite {
  usuarioId: string | null;
  acao: string;
  em: Date;
}

const PLANTAO_DO_TERMO = {
  escala: { include: { setor: { include: { unidade: { include: { instituicao: true } } } } } },
} as const;

type PlantaoComInstituicao = Prisma.PlantaoGetPayload<{ include: typeof PLANTAO_DO_TERMO }>;

function plantaoDoTermo(p: PlantaoComInstituicao): PlantaoDoTermo {
  return {
    id: p.id,
    setor: p.escala.setor.nome,
    unidade: p.escala.setor.unidade.nome,
    instituicao: p.escala.setor.unidade.instituicao.nome,
    inicio: p.inicio.toISOString(),
    fim: p.fim.toISOString(),
    valorCentavos: p.valorCentavos,
    especialidade: p.especialidadeExigida,
    modeloContratacao: p.modeloContratacao,
  };
}

/**
 * F13 — emite, assina e entrega os termos (DEC-184 a DEC-187).
 *
 * Global, como a auditoria: a emissão acontece DENTRO das transações de outros
 * módulos — escalar (contrato), aprovar repasse (substituição), check-in
 * (aceite do médico escalado direto, DEC-185). O termo nasce junto com o fato
 * que ele documenta, ou não nasce.
 */
@Injectable()
export class TermoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Contrato do plantão, na escala do médico — por qualquer dos três caminhos (F10). */
  async emitirContrato(
    tx: Tx,
    plantaoId: string,
    medicoId: string,
    instituicao: Aceite,
    medico: Aceite | null,
  ): Promise<void> {
    const p = await tx.plantao.findUniqueOrThrow({
      where: { id: plantaoId },
      include: PLANTAO_DO_TERMO,
    });
    const inst = p.escala.setor.unidade.instituicao;
    const parteMedico = await this.parteMedico(tx, medicoId, 'MEDICO');
    const parteInst: Parte = {
      papel: 'INSTITUICAO',
      nome: inst.nome,
      registro: registroDeCnpj(inst.cnpj),
    };

    const conteudo = montarContrato({
      plantao: plantaoDoTermo(p),
      medico: parteMedico,
      instituicao: parteInst,
      prazoContestacaoHoras: inst.prazoContestacaoHoras,
      emitidoEm: new Date(),
    });

    await this.gravar(tx, conteudo, null, [
      { parte: parteInst, aceite: instituicao },
      ...(medico === null ? [] : [{ parte: parteMedico, aceite: medico }]),
    ]);
  }

  /**
   * Termo de substituição, na aprovação do repasse. Os três aceites já
   * aconteceram — pedido, aceite do convite, aprovação — e viram as assinaturas.
   * Os termos vigentes do plantão deixam de valer.
   */
  async emitirSubstituicao(tx: Tx, repasseId: string, aprovador: Aceite): Promise<void> {
    const r = await tx.repasse.findUniqueOrThrow({
      where: { id: repasseId },
      include: {
        plantao: { include: PLANTAO_DO_TERMO },
        convites: { where: { status: 'ACEITO' }, orderBy: { respondidoEm: 'desc' }, take: 1 },
      },
    });
    if (r.medicoSubstitutoId === null) {
      return;
    }

    const inst = r.plantao.escala.setor.unidade.instituicao;
    const titular = await this.parteMedico(tx, r.medicoTitularId, 'TITULAR');
    const substituto = await this.parteMedico(tx, r.medicoSubstitutoId, 'SUBSTITUTO');
    const parteInst: Parte = {
      papel: 'INSTITUICAO',
      nome: inst.nome,
      registro: registroDeCnpj(inst.cnpj),
    };

    await tx.termo.updateMany({
      where: { plantaoId: r.plantaoId, substituidoEm: null },
      data: { substituidoEm: aprovador.em },
    });

    const conteudo = montarSubstituicao({
      plantao: plantaoDoTermo(r.plantao),
      titular,
      substituto,
      instituicao: parteInst,
      repasse: { id: r.id, motivo: r.motivo, modeloFiscal: r.modeloFiscal },
      aprovadoEm: aprovador.em,
      emitidoEm: aprovador.em,
    });

    const usuarios = await tx.medico.findMany({
      where: { id: { in: [r.medicoTitularId, r.medicoSubstitutoId] } },
      select: { id: true, usuarioId: true },
    });
    const usuarioDe = (id: string): string | null =>
      usuarios.find((u) => u.id === id)?.usuarioId ?? null;

    await this.gravar(tx, conteudo, r.id, [
      {
        parte: titular,
        aceite: {
          usuarioId: usuarioDe(r.medicoTitularId),
          acao: 'Pediu o repasse',
          em: r.criadoEm,
        },
      },
      {
        parte: substituto,
        aceite: {
          usuarioId: usuarioDe(r.medicoSubstitutoId),
          acao: 'Aceitou o convite',
          em: r.convites[0]?.respondidoEm ?? aprovador.em,
        },
      },
      { parte: parteInst, aceite: aprovador },
    ]);
  }

  /** DEC-185 — na escala direta, o check-in é o aceite do médico. */
  async aceitarNoCheckin(
    tx: Tx,
    plantaoId: string,
    medicoId: string,
    aceite: Aceite,
  ): Promise<void> {
    const termo = await tx.termo.findFirst({
      where: {
        plantaoId,
        tipo: 'CONTRATO_PLANTAO',
        substituidoEm: null,
        assinaturas: { none: { papel: 'MEDICO' } },
      },
      orderBy: { emitidoEm: 'desc' },
    });
    if (termo === null) {
      return;
    }

    const parte = await this.parteMedico(tx, medicoId, 'MEDICO');
    const doTermo = (termo.conteudo as unknown as ConteudoDoTermo).partes.find(
      (x) => x.papel === 'MEDICO',
    );
    // Só o médico do contrato aceita o contrato.
    if (doTermo?.registro !== parte.registro) {
      return;
    }

    await tx.assinaturaTermo.create({
      data: {
        termoId: termo.id,
        papel: 'MEDICO',
        usuarioId: aceite.usuarioId,
        nome: parte.nome,
        registro: parte.registro,
        acao: aceite.acao,
        assinadaEm: aceite.em,
        hashAssinado: termo.hash,
      },
    });
  }

  // --- leitura ----------------------------------------------------------------

  async listar(plantaoId: string, usuario: UsuarioAutenticado): Promise<TermoResponse[]> {
    await this.exigirParticipante(plantaoId, usuario);
    const termos = await this.prisma.termo.findMany({
      where: { plantaoId },
      include: { assinaturas: { orderBy: { assinadaEm: 'asc' } } },
      orderBy: { emitidoEm: 'desc' },
    });
    return termos.map((t) => ({
      id: t.id,
      tipo: t.tipo,
      emitidoEm: t.emitidoEm.toISOString(),
      hash: t.hash,
      vigente: t.substituidoEm === null,
      assinaturas: t.assinaturas.map((a) => ({
        papel: a.papel,
        nome: a.nome,
        registro: a.registro,
        metodo: a.metodo,
        acao: a.acao,
        assinadaEm: a.assinadaEm.toISOString(),
      })),
      pendentes: PAPEIS_DO_TERMO[t.tipo].filter((p) => !t.assinaturas.some((a) => a.papel === p)),
    }));
  }

  async pdf(
    termoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<{ arquivo: Buffer; nome: string }> {
    const t = await this.prisma.termo.findUnique({
      where: { id: termoId },
      include: { assinaturas: { orderBy: { assinadaEm: 'asc' } } },
    });
    if (t === null) {
      throw new SemAcessoAoRecursoError();
    }
    await this.exigirParticipante(t.plantaoId, usuario);

    const conteudo = t.conteudo as unknown as ConteudoDoTermo;
    const arquivo = await renderizarTermo({
      conteudo,
      hash: t.hash,
      vigente: t.substituidoEm === null,
      assinaturas: t.assinaturas,
      pendentes: PAPEIS_DO_TERMO[t.tipo].filter((p) => !t.assinaturas.some((a) => a.papel === p)),
    });
    const tipo = t.tipo === 'SUBSTITUICAO' ? 'termo-de-substituicao' : 'contrato-do-plantao';
    return { arquivo, nome: `${tipo}-${t.id.slice(0, 8)}.pdf` };
  }

  // --- internos ---------------------------------------------------------------

  private async gravar(
    tx: Tx,
    conteudo: ConteudoDoTermo,
    repasseId: string | null,
    assinaturas: readonly { parte: Parte; aceite: Aceite }[],
  ): Promise<void> {
    const hash = hashDe(conteudo);
    const termo = await tx.termo.create({
      data: {
        tipo: conteudo.tipo,
        plantaoId: conteudo.plantao.id,
        repasseId,
        conteudo: conteudo as unknown as Prisma.InputJsonValue,
        hash,
        emitidoEm: new Date(conteudo.emitidoEm),
      },
    });
    await tx.assinaturaTermo.createMany({
      data: assinaturas.map(({ parte, aceite }) => ({
        termoId: termo.id,
        papel: parte.papel as PapelNoTermo,
        usuarioId: aceite.usuarioId,
        nome: parte.nome,
        registro: parte.registro,
        acao: aceite.acao,
        assinadaEm: aceite.em,
        hashAssinado: hash,
      })),
    });
  }

  private async parteMedico(tx: Tx, medicoId: string, papel: PapelNoTermo): Promise<Parte> {
    const m = await tx.medico.findUniqueOrThrow({
      where: { id: medicoId },
      select: { crm: true, crmUf: true, usuario: { select: { nome: true } } },
    });
    return { papel, nome: m.usuario.nome, registro: registroDeCrm(m.crm, m.crmUf) };
  }

  /**
   * Quem lê um termo: os médicos do plantão (titular, executante, partes de um
   * repasse dele) e a administração ou chefia da instituição. Para os demais, o
   * termo não existe (ADR-026).
   */
  private async exigirParticipante(plantaoId: string, usuario: UsuarioAutenticado): Promise<void> {
    const p = await this.prisma.plantao.findUnique({
      where: { id: plantaoId },
      select: {
        medicoTitularId: true,
        medicoExecutanteId: true,
        escala: { select: { setor: { select: { unidade: { select: { instituicaoId: true } } } } } },
        repasses: { select: { medicoTitularId: true, medicoSubstitutoId: true } },
      },
    });
    if (p === null) {
      throw new SemAcessoAoRecursoError();
    }

    const instituicaoId = p.escala.setor.unidade.instituicaoId;
    const daInstituicao = usuario.perfis.some(
      (x) =>
        x.instituicaoId === instituicaoId &&
        (x.perfil === 'ADMIN_INSTITUICAO' || x.perfil === 'CHEFIA_ESCALA'),
    );
    if (daInstituicao) {
      return;
    }

    const medico = await this.prisma.medico.findUnique({
      where: { usuarioId: usuario.id },
      select: { id: true },
    });
    const medicos = new Set(
      [
        p.medicoTitularId,
        p.medicoExecutanteId,
        ...p.repasses.flatMap((r) => [r.medicoTitularId, r.medicoSubstitutoId]),
      ].filter((x): x is string => x !== null),
    );
    if (medico === null || !medicos.has(medico.id)) {
      throw new SemAcessoAoRecursoError();
    }
  }
}
