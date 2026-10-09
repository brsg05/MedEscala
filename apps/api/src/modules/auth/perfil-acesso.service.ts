import { Injectable } from '@nestjs/common';
import type { PerfilAtribuido } from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { UsuarioNaoEncontradoError } from '../../shared/errors/dominio-negocio.error';
import { AuditoriaService } from '../auditoria/auditoria.service';

interface Entrada {
  perfis: readonly PerfilAtribuido[];
  expiraEm: number;
}

/**
 * Resolve os perfis de um usuário a cada requisição, com cache curto (D8).
 *
 * Por que consulta em vez de claim no JWT: perfil revogado precisa valer AGORA.
 * Se os perfis viajassem dentro do token, tirar a chefia de alguém só teria efeito
 * quando o token expirasse — inaceitável numa função bloqueante como a F11.
 *
 * O cache de poucos segundos existe só para não repetir a mesma query em rajada de
 * requisições da mesma tela. É em memória e por processo de propósito: introduzir
 * Redis contraria o ADR-004, que manda rever só com gargalo medido.
 */
@Injectable()
export class PerfilAcessoService {
  private static readonly TTL_MS = 5_000;

  private readonly cache = new Map<string, Entrada>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * DEC-064 — o admin concede CHEFIA_ESCALA a quem JÁ tem conta.
   *
   * Não há convite por e-mail ainda (o F22 não tem provedor), então não se cria
   * conta para ninguém daqui: a pessoa se cadastra antes e o admin a promove.
   * Idempotente — conceder duas vezes não duplica o perfil.
   */
  async concederChefia(
    instituicaoId: string,
    email: string,
    atorId: string,
  ): Promise<{ usuarioId: string; nome: string; email: string }> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true, nome: true, email: true },
    });

    if (usuario === null) {
      throw new UsuarioNaoEncontradoError();
    }

    const existente = await this.prisma.perfilAcesso.findFirst({
      where: { usuarioId: usuario.id, instituicaoId, perfil: 'CHEFIA_ESCALA' },
    });

    if (existente === null) {
      await this.prisma.perfilAcesso.create({
        data: { usuarioId: usuario.id, instituicaoId, perfil: 'CHEFIA_ESCALA' },
      });

      await this.auditoria.registrar({
        acao: 'CHEFIA_CONCEDIDA',
        entidade: 'Instituicao',
        entidadeId: instituicaoId,
        atorId,
        estadoNovo: 'CHEFIA_ESCALA',
        payload: { usuarioId: usuario.id },
      });
    } else if (!existente.ativo) {
      await this.prisma.perfilAcesso.update({ where: { id: existente.id }, data: { ativo: true } });
    }

    // Revogação e concessão precisam valer na hora (ADR-014).
    this.invalidar(usuario.id);

    return { usuarioId: usuario.id, nome: usuario.nome, email: usuario.email };
  }

  async perfisDe(usuarioId: string): Promise<readonly PerfilAtribuido[]> {
    const agora = Date.now();
    const emCache = this.cache.get(usuarioId);

    if (emCache !== undefined && emCache.expiraEm > agora) {
      return emCache.perfis;
    }

    const linhas = await this.prisma.perfilAcesso.findMany({
      where: { usuarioId, ativo: true },
      include: { instituicao: { select: { nome: true } } },
      orderBy: [{ perfil: 'asc' }, { instituicaoId: 'asc' }],
    });

    const perfis: readonly PerfilAtribuido[] = linhas.map((l) => ({
      perfil: l.perfil,
      instituicaoId: l.instituicaoId,
      instituicaoNome: l.instituicao?.nome ?? null,
    }));

    this.cache.set(usuarioId, { perfis, expiraEm: agora + PerfilAcessoService.TTL_MS });

    return perfis;
  }

  /** Chamar sempre que um perfil for concedido ou revogado. */
  invalidar(usuarioId: string): void {
    this.cache.delete(usuarioId);
  }

  /** Usado pelos testes para garantir isolamento entre casos. */
  limparCache(): void {
    this.cache.clear();
  }
}
