import { Module } from '@nestjs/common';
import { CredenciamentoModule } from '../credenciamento/credenciamento.module';
import { EscalaModule } from '../escala/escala.module';
import { OperadorController } from './operador.controller';

@Module({
  imports: [CredenciamentoModule, EscalaModule],
  controllers: [OperadorController],
})
export class OperadorModule {}
