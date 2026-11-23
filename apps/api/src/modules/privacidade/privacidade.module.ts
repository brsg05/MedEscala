import { Global, Module } from '@nestjs/common';
import { AceiteDaPoliticaGuard } from './aceite.guard';
import { PrivacidadeController } from './privacidade.controller';
import { PrivacidadeService } from './privacidade.service';

/**
 * F24 — global como a auditoria: o cadastro (módulo `auth`) grava o aceite na
 * mesma transação da conta, e o guard global consulta o serviço.
 */
@Global()
@Module({
  controllers: [PrivacidadeController],
  providers: [PrivacidadeService, AceiteDaPoliticaGuard],
  exports: [PrivacidadeService, AceiteDaPoliticaGuard],
})
export class PrivacidadeModule {}
