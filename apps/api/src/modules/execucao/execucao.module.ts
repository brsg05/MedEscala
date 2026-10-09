import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CredenciamentoModule } from '../credenciamento/credenciamento.module';
import { EscalaModule } from '../escala/escala.module';
import { RepasseModule } from '../repasse/repasse.module';
import { ExecucaoController } from './execucao.controller';
import { ExecucaoService } from './execucao.service';
import { FILA_DE_EXECUCAO, LembretesDeExecucaoProcessor } from './lembretes.processor';

/**
 * F16 — confirmação de execução.
 *
 * Módulo próprio, e não parte da escala: depende do repasse (o check-in precisa
 * encerrar o repasse que venceu no início do plantão, DEC-104), e o repasse já
 * depende da escala — dentro da escala, isto fecharia um ciclo.
 */
@Module({
  imports: [
    CredenciamentoModule,
    EscalaModule,
    RepasseModule,
    BullModule.registerQueue({ name: FILA_DE_EXECUCAO }),
  ],
  controllers: [ExecucaoController],
  providers: [ExecucaoService, LembretesDeExecucaoProcessor],
  exports: [ExecucaoService],
})
export class ExecucaoModule {}
