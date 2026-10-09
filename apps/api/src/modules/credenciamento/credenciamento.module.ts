import { Module } from '@nestjs/common';
import { CredenciamentoController } from './credenciamento.controller';
import { CredenciamentoService } from './credenciamento.service';

@Module({
  controllers: [CredenciamentoController],
  providers: [CredenciamentoService],
  exports: [CredenciamentoService],
})
export class CredenciamentoModule {}
