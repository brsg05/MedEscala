import { Global, Module } from '@nestjs/common';
import { TermoService } from './termo.service';
import { TermosController } from './termos.controller';

/**
 * Global pelo mesmo motivo da auditoria e das notificações: o termo é emitido
 * dentro da transação de outros módulos (escala, repasse, execução), e nasce
 * com o fato que documenta (F13).
 */
@Global()
@Module({
  controllers: [TermosController],
  providers: [TermoService],
  exports: [TermoService],
})
export class TermosModule {}
