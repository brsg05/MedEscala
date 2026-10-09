import { Global, Module } from '@nestjs/common';
import { NotificacaoController } from './notificacao.controller';
import { NotificacaoService } from './notificacao.service';

/**
 * Global pelo mesmo motivo da auditoria: todo módulo de domínio avisa alguém, e
 * o aviso é gravado na transação da ação (DEC-128). É infraestrutura transversal,
 * não um domínio que os outros consomem.
 */
@Global()
@Module({
  controllers: [NotificacaoController],
  providers: [NotificacaoService],
  exports: [NotificacaoService],
})
export class NotificacaoModule {}
