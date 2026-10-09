import { Global, Module } from '@nestjs/common';
import { EMISSOR_DE_NFSE, EmissorSimulado } from './emissor-nfse';
import { GATEWAY_DE_PAGAMENTO, GatewaySimulado } from './gateway-de-pagamento';

/**
 * Integrações externas como porta + adaptador (DEC-204). Hoje só existem os
 * adaptadores simulados (DEC-122); o real entra aqui, escolhido por variável de
 * ambiente, sem que nenhum módulo de domínio perceba.
 */
@Global()
@Module({
  providers: [
    { provide: GATEWAY_DE_PAGAMENTO, useClass: GatewaySimulado },
    { provide: EMISSOR_DE_NFSE, useClass: EmissorSimulado },
  ],
  exports: [GATEWAY_DE_PAGAMENTO, EMISSOR_DE_NFSE],
})
export class IntegracoesModule {}
