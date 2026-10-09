import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Porta do emissor de NFS-e (F14; RNF05) — DEC-204.
 *
 * O real exige certificado digital do médico, procuração e um adaptador por
 * município (o padrão ABRASF ajuda, a adesão varia). Por isso é simulado no MVP
 * (DEC-122): o domínio já funciona como se emitisse, e trocar é trocar a classe.
 */
export interface EmissorDeNfse {
  emitir(p: {
    prestadorRegistro: string;
    tomadorRegistro: string;
    valorCentavos: number;
    discriminacao: string;
  }): Promise<{ numero: string; codigoVerificacao: string; emitidaEm: Date }>;
  cancelar(numero: string): Promise<void>;
}

export const EMISSOR_DE_NFSE = Symbol('EMISSOR_DE_NFSE');

/** Adaptador simulado: número com prefixo `SIM-`, para não passar por nota real. */
@Injectable()
export class EmissorSimulado implements EmissorDeNfse {
  emitir(): Promise<{ numero: string; codigoVerificacao: string; emitidaEm: Date }> {
    const agora = new Date();
    return Promise.resolve({
      numero: `SIM-${String(agora.getUTCFullYear())}-${String(randomInt(1, 999_999)).padStart(6, '0')}`,
      codigoVerificacao: randomInt(0, 2 ** 32)
        .toString(16)
        .toUpperCase()
        .padStart(8, '0'),
      emitidaEm: agora,
    });
  }

  cancelar(): Promise<void> {
    return Promise.resolve();
  }
}
