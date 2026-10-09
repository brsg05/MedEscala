import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Porta do meio de pagamento com split (F15, F17; RNF05) — DEC-204.
 *
 * O domínio fala só com esta interface. Hoje existe o adaptador simulado; o real
 * (um PSP com subcontas e split) entra como outra classe, sem mexer no domínio.
 * Na vida real, cada chamada destas é rede e pode falhar — por isso todas devolvem
 * a referência que o PSP deu, e o domínio guarda essa referência.
 */
export interface GatewayDePagamento {
  /** Reserva o valor no meio de pagamento da pagadora (garantia, F15). */
  preAutorizar(p: { valorCentavos: number; descricao: string }): Promise<{ referencia: string }>;
  /** Efetiva a cobrança pré-autorizada; o valor fica retido na plataforma. */
  capturar(referencia: string): Promise<void>;
  /** Desfaz uma pré-autorização ainda não capturada. */
  cancelar(referencia: string): Promise<void>;
  /** Devolve à pagadora um valor já capturado (contestação procedente). */
  estornar(referencia: string): Promise<void>;
  /** Repassa ao beneficiário o líquido, separado da taxa da plataforma (split). */
  liberar(p: {
    referencia: string;
    liquidoCentavos: number;
    taxaPlataformaCentavos: number;
  }): Promise<void>;
}

export const GATEWAY_DE_PAGAMENTO = Symbol('GATEWAY_DE_PAGAMENTO');

/**
 * Adaptador simulado: aprova tudo, na hora, e devolve referências com prefixo
 * `sim_` — para ninguém confundir com cobrança de verdade.
 */
@Injectable()
export class GatewaySimulado implements GatewayDePagamento {
  preAutorizar(): Promise<{ referencia: string }> {
    return Promise.resolve({ referencia: `sim_pag_${randomUUID()}` });
  }

  capturar(): Promise<void> {
    return Promise.resolve();
  }

  cancelar(): Promise<void> {
    return Promise.resolve();
  }

  estornar(): Promise<void> {
    return Promise.resolve();
  }

  liberar(): Promise<void> {
    return Promise.resolve();
  }
}
