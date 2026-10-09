import { Injectable } from '@nestjs/common';
import type { DecisaoResponse, RepasseComPlantao } from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EscalaService, PLANTAO_COMPLETO } from '../escala/escala.service';
import { FilaDeConvitesService } from './fila-de-convites.service';
import { RepasseService } from './repasse.service';

/**
 * Listagens que as telas consomem.
 *
 * Separado do `RepasseService` de propósito: aquele é dono das transições de
 * estado e das regras; este só lê. Misturar leitura de tela com máquina de
 * estados faz o arquivo que guarda a RN01 crescer por motivos que não são a RN01.
 */
@Injectable()
export class ListagemDeRepassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escala: EscalaService,
    private readonly repasse: RepasseService,
    private readonly fila: FilaDeConvitesService,
  ) {}

  /**
   * F10 / F11 — o que espera decisão do usuário.
   *
   * O critério vem do PERFIL, não de parâmetro do cliente: médico vê convites
   * para cobrir, chefia vê substituições para aprovar. Um médico não consegue
   * pedir a lista de aprovações pendentes de uma instituição.
   */
  async decisoesPendentes(
    medicoId: string | null,
    instituicoesDeChefia: readonly string[],
  ): Promise<DecisaoResponse[]> {
    // DEC-097: antes de responder "o que espera você", vence os convites com
    // prazo passado — se o Redis tiver perdido o job, é aqui que a fila anda.
    await this.fila.varrerVencidos();

    const decisoes: DecisaoResponse[] = [];

    if (medicoId !== null) {
      // Só o convite da VEZ: quem está NA_FILA ainda não foi convidado (DEC-089).
      // De repasse ou de vaga aberta (DEC-164).
      const convites = await this.prisma.convite.findMany({
        where: { medicoId, status: 'ATIVO', prazoAte: { gt: new Date() } },
        orderBy: { prazoAte: 'asc' },
        select: { repasseId: true, plantaoId: true, prazoAte: true, origem: true },
      });

      for (const c of convites) {
        if (c.repasseId === null) {
          decisoes.push({
            tipo: 'ACEITAR_VAGA',
            plantao: await this.plantao(c.plantaoId),
            // `prazoAte > agora` no filtro: nunca nulo aqui.
            prazoConviteAte: (c.prazoAte ?? new Date()).toISOString(),
            origemConvite: c.origem,
          });
          continue;
        }

        const repasse = await this.repasse.buscar(c.repasseId);
        decisoes.push({
          tipo: 'ACEITAR_CONVITE',
          repasse,
          plantao: await this.plantao(repasse.plantaoId),
        });
      }
    }

    if (instituicoesDeChefia.length > 0) {
      const aprovacoes = await this.prisma.repasse.findMany({
        where: {
          status: 'AGUARDANDO_APROVACAO',
          plantao: {
            escala: { setor: { unidade: { instituicaoId: { in: [...instituicoesDeChefia] } } } },
          },
        },
        orderBy: { criadoEm: 'asc' },
      });

      for (const r of aprovacoes) {
        decisoes.push({
          tipo: 'APROVAR_SUBSTITUICAO',
          repasse: await this.repasse.buscar(r.id),
          plantao: await this.plantao(r.plantaoId),
        });
      }
    }

    return decisoes;
  }

  /** Repasses em que o usuário aparece — como titular, substituto ou chefia. */
  async meusRepasses(
    medicoId: string | null,
    instituicoesDeChefia: readonly string[],
  ): Promise<RepasseComPlantao[]> {
    const condicoes = [];

    if (medicoId !== null) {
      condicoes.push({ medicoTitularId: medicoId }, { medicoSubstitutoId: medicoId });
    }

    if (instituicoesDeChefia.length > 0) {
      condicoes.push({
        plantao: {
          escala: { setor: { unidade: { instituicaoId: { in: [...instituicoesDeChefia] } } } },
        },
      });
    }

    if (condicoes.length === 0) {
      return [];
    }

    await this.fila.varrerVencidos();

    const repasses = await this.prisma.repasse.findMany({
      where: { OR: condicoes },
      orderBy: { criadoEm: 'desc' },
      take: 50,
    });

    const resultado: RepasseComPlantao[] = [];

    for (const r of repasses) {
      resultado.push({
        repasse: await this.repasse.buscar(r.id),
        plantao: await this.plantao(r.plantaoId),
      });
    }

    return resultado;
  }

  private async plantao(id: string) {
    const p = await this.prisma.plantao.findUniqueOrThrow({
      where: { id },
      include: PLANTAO_COMPLETO,
    });
    return this.escala.paraResposta(p);
  }
}
