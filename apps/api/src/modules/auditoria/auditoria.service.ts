import { Injectable } from '@nestjs/common';
import type { Perfil, Prisma } from '@prisma/client';
import type { EventoAuditoriaResponse } from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface NovoEvento {
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  atorId?: string | null;
  atorPerfil?: Perfil | null;
  estadoAnterior?: string | null;
  estadoNovo?: string | null;
  payload?: Prisma.InputJsonValue;
}

/**
 * Trilha append-only (ADR-007, RNF04).
 *
 * `registrar` aceita um cliente de transação: quando a mudança de estado e o evento
 * compartilham a transação, é impossível existir estado sem evento correspondente.
 * É essa propriedade que o critério do Sprint 3 cobra — "após um repasse completo, a
 * consulta devolve a sequência exata de eventos".
 *
 * Não existe `atualizar` nem `remover`, e não é por disciplina: o SQL de policy faz
 * REVOKE de UPDATE e DELETE nesta tabela. Se alguém escrever esses métodos, o
 * Postgres recusa.
 */
@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(evento: NovoEvento, tx?: Prisma.TransactionClient): Promise<void> {
    const cliente = tx ?? this.prisma;

    await cliente.eventoAuditoria.create({
      data: {
        acao: evento.acao,
        entidade: evento.entidade,
        entidadeId: evento.entidadeId ?? null,
        atorId: evento.atorId ?? null,
        atorPerfil: evento.atorPerfil ?? null,
        estadoAnterior: evento.estadoAnterior ?? null,
        estadoNovo: evento.estadoNovo ?? null,
        ...(evento.payload === undefined ? {} : { payload: evento.payload }),
      },
    });
  }

  /**
   * F23 — trilha de um plantão e de todos os seus repasses.
   *
   * Ordenada por `id` (sequência), não por `ocorridoEm`: eventos da mesma
   * transação compartilham o carimbo de tempo, e ele não desempata. A checagem
   * de quem pode ler fica com quem chama — este serviço não sabe quem participa
   * de um plantão.
   */
  async trilhaDoPlantao(plantaoId: string): Promise<EventoAuditoriaResponse[]> {
    const repasses = await this.prisma.repasse.findMany({
      where: { plantaoId },
      select: { id: true },
    });

    const eventos = await this.prisma.eventoAuditoria.findMany({
      where: {
        OR: [
          { entidade: 'Plantao', entidadeId: plantaoId },
          { entidade: 'Repasse', entidadeId: { in: repasses.map((r) => r.id) } },
        ],
      },
      orderBy: { id: 'asc' },
    });

    return eventos.map((e) => ({
      // BigInt não atravessa JSON: vira string na fronteira.
      id: e.id.toString(),
      ocorridoEm: e.ocorridoEm.toISOString(),
      acao: e.acao,
      entidade: e.entidade,
      entidadeId: e.entidadeId,
      estadoAnterior: e.estadoAnterior,
      estadoNovo: e.estadoNovo,
      atorId: e.atorId,
    }));
  }
}
