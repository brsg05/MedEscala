import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CredenciamentoModule } from '../credenciamento/credenciamento.module';
import { EscalaModule } from '../escala/escala.module';
import { RepasseController } from './repasse.controller';
import { FILA_DE_CONVITES, FilaDeConvitesService } from './fila-de-convites.service';
import { ListagemDeRepassesService } from './listagem.service';
import { RepasseService } from './repasse.service';
import { VencimentoDeConvitesProcessor } from './vencimento-de-convites.processor';

/**
 * O módulo importa o SERVICE da escala, nunca o repositório dela — é a regra do
 * §6 do guia: "módulo não importa repositório de outro módulo".
 */
@Module({
  imports: [
    EscalaModule,
    CredenciamentoModule,
    BullModule.registerQueue({ name: FILA_DE_CONVITES }),
  ],
  controllers: [RepasseController],
  providers: [
    RepasseService,
    ListagemDeRepassesService,
    FilaDeConvitesService,
    VencimentoDeConvitesProcessor,
  ],
  exports: [RepasseService],
})
export class RepasseModule {}
