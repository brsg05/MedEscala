import { Module } from '@nestjs/common';
import { CredenciamentoModule } from '../credenciamento/credenciamento.module';
import { EscalaModule } from '../escala/escala.module';
import { RepasseModule } from '../repasse/repasse.module';
import { VagasController } from './vagas.controller';
import { VagasService } from './vagas.service';

/**
 * F10 — preencher a vaga aberta. Depende da fila de convites (que mora no
 * módulo de repasse desde a DEC-087, e serve aos dois desde a DEC-164) e da
 * atribuição da escala.
 */
@Module({
  imports: [CredenciamentoModule, EscalaModule, RepasseModule],
  controllers: [VagasController],
  providers: [VagasService],
})
export class VagasModule {}
