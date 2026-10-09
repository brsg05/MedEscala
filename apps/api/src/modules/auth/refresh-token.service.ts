import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RefreshTokenInvalidoError } from '../../shared/errors/dominio.error';

/** Validade do registro local do refresh. */
const VALIDADE_DIAS = 30;

export interface RefreshValidado {
  usuarioId: string;
  familia: string;
}

/**
 * Rotação e revogação de refresh tokens (D9).
 *
 * O Supabase já rotaciona por conta própria; esta tabela existe para o que ele não
 * dá: revogação do lado da api (logout de verdade) e **detecção de reuso**.
 *
 * Reuso: cada login inicia uma "família". A cada renovação o token antigo é marcado
 * revogado e o novo entra na mesma família. Se um token JÁ revogado for apresentado,
 * só há duas explicações — cópia roubada ou replay — e em ambas a resposta correta é
 * derrubar a família inteira, não apenas recusar aquela chamada.
 *
 * Guardamos apenas SHA-256 do token. Sem sal, de propósito: o token do Supabase já é
 * de alta entropia, e aqui o hash é chave de busca, não verificação de senha.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Token aleatório para o cookie de CSRF (double-submit). */
  static novoCsrfToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private static expiraEm(): Date {
    return new Date(Date.now() + VALIDADE_DIAS * 24 * 60 * 60 * 1000);
  }

  /** Início de sessão: cria uma família nova. */
  async iniciarFamilia(usuarioId: string, refreshToken: string): Promise<string> {
    const familia = randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        usuarioId,
        familia,
        tokenHash: RefreshTokenService.hash(refreshToken),
        expiraEm: RefreshTokenService.expiraEm(),
      },
    });

    return familia;
  }

  /**
   * Valida o token apresentado. Se ele já tiver sido usado, revoga a família toda
   * e recusa — ver comentário do módulo.
   */
  async validar(refreshToken: string): Promise<RefreshValidado> {
    const registro = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: RefreshTokenService.hash(refreshToken) },
    });

    if (registro === null) {
      throw new RefreshTokenInvalidoError();
    }

    if (registro.revogadoEm !== null) {
      this.logger.warn(
        `Reuso de refresh token detectado (usuário ${registro.usuarioId}, ` +
          `família ${registro.familia}). Revogando a família inteira.`,
      );
      await this.revogarFamilia(registro.familia);
      throw new RefreshTokenInvalidoError('Refresh token já utilizado. Faça login novamente');
    }

    if (registro.expiraEm.getTime() <= Date.now()) {
      throw new RefreshTokenInvalidoError('Refresh token expirado');
    }

    return { usuarioId: registro.usuarioId, familia: registro.familia };
  }

  /**
   * Troca o token antigo pelo novo dentro da mesma família, numa transação: não pode
   * existir instante em que os dois valem, nem em que nenhum vale.
   */
  async rotacionar(params: {
    usuarioId: string;
    familia: string;
    tokenAntigo: string;
    tokenNovo: string;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { tokenHash: RefreshTokenService.hash(params.tokenAntigo) },
        data: { revogadoEm: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          usuarioId: params.usuarioId,
          familia: params.familia,
          tokenHash: RefreshTokenService.hash(params.tokenNovo),
          expiraEm: RefreshTokenService.expiraEm(),
        },
      }),
    ]);
  }

  async revogarFamilia(familia: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familia, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
  }

  /** Logout: revoga a família do token apresentado, se ele ainda for conhecido. */
  async revogarPorToken(refreshToken: string): Promise<void> {
    const registro = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: RefreshTokenService.hash(refreshToken) },
      select: { familia: true },
    });

    if (registro !== null) {
      await this.revogarFamilia(registro.familia);
    }
  }
}
