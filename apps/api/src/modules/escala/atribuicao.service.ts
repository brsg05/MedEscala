import { Injectable } from '@nestjs/common';
import type { PlantaoResponse } from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificacaoService } from '../notificacao/notificacao.service';
import { descreverPlantao } from '../notificacao/textos';
import {
  ForaDoEscopoDaInstituicaoError,
  InstituicaoPendenteError,
  MedicoNaoEncontradoError,
  MedicoNaoVerificadoError,
  RequisitosNaoAtendidosError,
  TransicaoInvalidaError,
} from '../../shared/errors/dominio-negocio.error';
import { EscalaService, PLANTAO_COMPLETO } from './escala.service';
import { podeTransicionar } from './domain/plantao.state';

/**
 * F12 — escalar um médico numa vaga.
 *
 * Fica separado do `EscalaService` porque é aqui que a RN02 é aplicada, e porque
 * este é o momento em que `medicoExecutanteId` recebe seu PRIMEIRO valor. A
 * partir daí o campo passa a ser regido pela RN01, e só `RepasseService.aprovar()`
 * pode alterá-lo — o trigger do banco permite a atribuição inicial (de NULL) e
 * recusa qualquer troca posterior sem repasse aprovado.
 */
@Injectable()
export class AtribuicaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly escala: EscalaService,
    private readonly notificacoes: NotificacaoService,
  ) {}

  async escalarMedico(
    plantaoId: string,
    medicoId: string,
    atorId: string,
    instituicoesDoAtor: readonly string[],
  ): Promise<PlantaoResponse> {
    const plantao = await this.escala.buscarPlantao(plantaoId);

    if (!instituicoesDoAtor.includes(plantao.escala.setor.unidade.instituicaoId)) {
      throw new ForaDoEscopoDaInstituicaoError();
    }

    if (plantao.escala.setor.unidade.instituicao.status !== 'ATIVA') {
      throw new InstituicaoPendenteError();
    }

    if (!podeTransicionar(plantao.status, 'CONFIRMADO') && plantao.status !== 'ABERTO') {
      throw new TransicaoInvalidaError('Plantao', plantao.status, 'CONFIRMADO');
    }

    const medico = await this.prisma.medico.findUnique({
      where: { id: medicoId },
      select: { id: true, verificado: true, especialidade: true },
    });

    if (medico === null) {
      throw new MedicoNaoEncontradoError();
    }

    // RN02, primeira metade: CRM irregular não entra na escala. No MVP a
    // regularidade é a conferência manual do operador da plataforma.
    if (!medico.verificado) {
      throw new MedicoNaoVerificadoError();
    }

    // RN02, segunda metade: requisitos obrigatórios da vaga.
    if (medico.especialidade !== plantao.especialidadeExigida) {
      throw new RequisitosNaoAtendidosError([plantao.especialidadeExigida]);
    }

    // RN03 — a exclusion constraint do banco garante; isto dá a mensagem legível.
    await this.escala.exigirAgendaLivre(medicoId, { inicio: plantao.inicio, fim: plantao.fim });

    const atualizado = await this.prisma.$transaction(async (tx) => {
      const p = await tx.plantao.update({
        where: { id: plantaoId },
        data: {
          medicoTitularId: medicoId,
          medicoExecutanteId: medicoId,
          status: 'CONFIRMADO',
        },
        include: PLANTAO_COMPLETO,
      });

      // F12 — a escala oficial mudou.
      await tx.escala.update({
        where: { id: plantao.escalaId },
        data: { versao: { increment: 1 } },
      });

      await this.auditoria.registrar(
        {
          acao: 'MEDICO_ESCALADO',
          entidade: 'Plantao',
          entidadeId: plantaoId,
          atorId,
          estadoAnterior: plantao.status,
          estadoNovo: 'CONFIRMADO',
          payload: { medicoId, escalaVersaoAnterior: plantao.escala.versao },
        },
        tx,
      );

      await this.notificacoes.notificar(tx, [{ medicoId }], {
        tipo: 'MEDICO_ESCALADO',
        titulo: 'Você foi escalado',
        corpo: `${descreverPlantao({
          setor: plantao.escala.setor.nome,
          unidade: plantao.escala.setor.unidade.nome,
          inicio: plantao.inicio,
        })} — ${plantao.escala.setor.unidade.instituicao.nome}.`,
        link: '/escala',
        entidade: 'Plantao',
        entidadeId: plantaoId,
      });

      return p;
    });

    return this.escala.paraResposta(atualizado);
  }
}
