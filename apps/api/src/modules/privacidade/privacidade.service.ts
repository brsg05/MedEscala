import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  politicaVigente,
  textoCanonicoDaPolitica,
  type PoliticaResponse,
  type SituacaoDoAceiteResponse,
  type VersaoDaPolitica,
} from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { PoliticaDesatualizadaError } from '../../shared/errors/dominio-negocio.error';
import { AuditoriaService } from '../auditoria/auditoria.service';

/** SHA-256 do texto canônico da versão — o que o aceite grava como prova. */
export function hashDaPolitica(p: VersaoDaPolitica): string {
  return createHash('sha256').update(textoCanonicoDaPolitica(p), 'utf8').digest('hex');
}

/** Quanto tempo um "já aceitou" fica em memória (mesma ideia do ADR-014). */
const CACHE_MS = 30_000;

/**
 * F24 — política de privacidade versionada e registro do aceite (ADR-015).
 *
 * O módulo é dono de `AceitePolitica`. Quem cria conta registra o aceite pela
 * mesma transação do cadastro (`registrarAceite` com `tx`), para não existir
 * conta sem aceite.
 */
@Injectable()
export class PrivacidadeService {
  /** Usuários que já aceitaram a versão vigente, com validade. Só guarda "sim". */
  private readonly aceitos = new Map<string, { versao: string; ate: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  politica(agora: Date = new Date()): PoliticaResponse {
    const p = politicaVigente(agora);
    return {
      versao: p.versao,
      vigenteDesde: p.vigenteDesde,
      resumo: p.resumo,
      itens: p.itens.map((i) => ({ ...i })),
      compromissos: [...p.compromissos],
      hash: hashDaPolitica(p),
    };
  }

  async situacao(usuarioId: string, agora: Date = new Date()): Promise<SituacaoDoAceiteResponse> {
    const vigente = politicaVigente(agora);
    const [ultimo, daVigente] = await Promise.all([
      this.prisma.aceitePolitica.findFirst({
        where: { usuarioId },
        orderBy: { aceitoEm: 'desc' },
      }),
      this.prisma.aceitePolitica.count({ where: { usuarioId, versao: vigente.versao } }),
    ]);
    const aceitouVigente = daVigente > 0;

    return {
      versaoVigente: vigente.versao,
      versaoAceita: ultimo?.versao ?? null,
      aceitoEm: ultimo?.aceitoEm.toISOString() ?? null,
      pendente: !aceitouVigente,
    };
  }

  /** Usado pelo guard a cada requisição; o "sim" fica em cache por alguns segundos. */
  async aceitouVigente(usuarioId: string, agora: Date = new Date()): Promise<boolean> {
    const versao = politicaVigente(agora).versao;
    const emCache = this.aceitos.get(usuarioId);

    if (emCache !== undefined && emCache.versao === versao && emCache.ate > agora.getTime()) {
      return true;
    }

    const existe = (await this.prisma.aceitePolitica.count({ where: { usuarioId, versao } })) > 0;

    if (existe) {
      this.aceitos.set(usuarioId, { versao, ate: agora.getTime() + CACHE_MS });
    }
    return existe;
  }

  /** Aceite pelo próprio usuário, já logado (versão nova da política). */
  async aceitar(usuarioId: string, versao: string): Promise<SituacaoDoAceiteResponse> {
    await this.prisma.$transaction(async (tx) => {
      await this.registrarAceite(tx, usuarioId, versao, 'tela_de_aceite');
    });
    return this.situacao(usuarioId);
  }

  /**
   * Grava o aceite da versão VIGENTE. Recusa versão diferente: aceite de texto
   * que não é mais o vigente não serve de prova de nada.
   *
   * Idempotente: aceitar duas vezes a mesma versão não cria registro novo.
   */
  async registrarAceite(
    tx: Prisma.TransactionClient,
    usuarioId: string,
    versao: string,
    origem: 'cadastro' | 'tela_de_aceite',
  ): Promise<void> {
    const vigente = politicaVigente();

    if (versao !== vigente.versao) {
      throw new PoliticaDesatualizadaError(vigente.versao);
    }

    const jaTem = await tx.aceitePolitica.findUnique({
      where: { usuarioId_versao: { usuarioId, versao } },
    });

    if (jaTem !== null) {
      return;
    }

    const hashTexto = hashDaPolitica(vigente);

    const aceite = await tx.aceitePolitica.create({
      data: { usuarioId, versao, hashTexto },
    });

    await this.auditoria.registrar(
      {
        acao: 'POLITICA_DE_PRIVACIDADE_ACEITA',
        entidade: 'AceitePolitica',
        entidadeId: aceite.id,
        atorId: usuarioId,
        estadoNovo: versao,
        payload: { versao, hashTexto, origem },
      },
      tx,
    );
  }
}
