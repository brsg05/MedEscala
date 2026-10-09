import { Injectable } from '@nestjs/common';
import type { Prisma, TipoNotificacao } from '@prisma/client';
import type { NotificacoesResponse } from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SemAcessoAoRecursoError } from '../../shared/errors/dominio-negocio.error';

type Tx = Prisma.TransactionClient;

/**
 * Para quem vai o aviso. Quem chama fala a língua do domínio (o médico, as
 * chefias de uma instituição); a tradução para usuários mora aqui.
 */
export type Destino =
  | { usuarioId: string }
  | { medicoId: string }
  | { chefiasDe: string }
  | { adminsDe: string }
  | { operadores: true };

export interface ConteudoDaNotificacao {
  tipo: TipoNotificacao;
  titulo: string;
  corpo: string;
  link?: string | null;
  entidade?: string | null;
  entidadeId?: string | null;
}

/** Quantas o sino mostra. O resto continua no banco; retenção é da F24 (em aberto). */
const LIMITE_DA_LISTA = 30;

/**
 * F22 — notificações in-app (DEC-121, DEC-127 a DEC-129).
 *
 * `notificar` EXIGE um cliente de transação, de propósito: o aviso é gravado na
 * mesma transação da ação que o provoca (DEC-128), como a trilha de auditoria.
 * Se a ação falhar, o aviso não existe; se o aviso falhar, a ação também volta.
 */
@Injectable()
export class NotificacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async notificar(
    tx: Tx,
    destinos: readonly Destino[],
    conteudo: ConteudoDaNotificacao,
  ): Promise<void> {
    const usuarios = await this.resolver(tx, destinos);

    if (usuarios.length === 0) {
      return;
    }

    await tx.notificacao.createMany({
      data: usuarios.map((usuarioId) => ({
        usuarioId,
        tipo: conteudo.tipo,
        titulo: conteudo.titulo,
        corpo: conteudo.corpo,
        link: conteudo.link ?? null,
        entidade: conteudo.entidade ?? null,
        entidadeId: conteudo.entidadeId ?? null,
      })),
    });
  }

  async listar(usuarioId: string): Promise<NotificacoesResponse> {
    const [naoLidas, itens] = await Promise.all([
      this.prisma.notificacao.count({ where: { usuarioId, lidaEm: null } }),
      this.prisma.notificacao.findMany({
        where: { usuarioId },
        orderBy: { criadaEm: 'desc' },
        take: LIMITE_DA_LISTA,
      }),
    ]);

    return {
      naoLidas,
      itens: itens.map((n) => ({
        id: n.id,
        tipo: n.tipo,
        titulo: n.titulo,
        corpo: n.corpo,
        link: n.link,
        criadaEm: n.criadaEm.toISOString(),
        lida: n.lidaEm !== null,
      })),
    };
  }

  /** Aviso de outra pessoa responde como inexistente (ADR-026). */
  async marcarLida(usuarioId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notificacao.updateMany({
      where: { id, usuarioId },
      data: { lidaEm: new Date() },
    });

    if (count === 0) {
      throw new SemAcessoAoRecursoError();
    }
  }

  async marcarTodasLidas(usuarioId: string): Promise<void> {
    await this.prisma.notificacao.updateMany({
      where: { usuarioId, lidaEm: null },
      data: { lidaEm: new Date() },
    });
  }

  private async resolver(tx: Tx, destinos: readonly Destino[]): Promise<string[]> {
    const ids = new Set<string>();

    for (const d of destinos) {
      if ('usuarioId' in d) {
        ids.add(d.usuarioId);
      } else if ('medicoId' in d) {
        const m = await tx.medico.findUnique({
          where: { id: d.medicoId },
          select: { usuarioId: true },
        });
        if (m !== null) ids.add(m.usuarioId);
      } else {
        const perfis = await tx.perfilAcesso.findMany({
          where:
            'chefiasDe' in d
              ? { instituicaoId: d.chefiasDe, perfil: 'CHEFIA_ESCALA', ativo: true }
              : 'adminsDe' in d
                ? { instituicaoId: d.adminsDe, perfil: 'ADMIN_INSTITUICAO', ativo: true }
                : { perfil: 'OPERADOR_PLATAFORMA', ativo: true },
          select: { usuarioId: true },
        });
        for (const p of perfis) ids.add(p.usuarioId);
      }
    }

    return [...ids];
  }
}
