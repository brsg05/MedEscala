import { Global, Module } from '@nestjs/common';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroService } from './financeiro.service';

/**
 * Global como termos e auditoria: reservar, capturar, estornar e liberar
 * acontecem dentro das transações da escala, do repasse e da execução.
 */
@Global()
@Module({
  controllers: [FinanceiroController],
  providers: [FinanceiroService],
  exports: [FinanceiroService],
})
export class FinanceiroModule {}
