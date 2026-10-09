import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CredenciamentoModule } from '../credenciamento/credenciamento.module';
import { AtribuicaoService } from './atribuicao.service';
import { EscalaController } from './escala.controller';
import { EscalaService } from './escala.service';
import { InstituicaoService } from './instituicao.service';

@Module({
  // AuthModule entra pelo PerfilAcessoService (concessão de chefia, DEC-064):
  // perfis são do módulo de auth, e este módulo usa o serviço, não a tabela.
  imports: [CredenciamentoModule, AuthModule],
  controllers: [EscalaController],
  providers: [EscalaService, AtribuicaoService, InstituicaoService],
  exports: [EscalaService, InstituicaoService],
})
export class EscalaModule {}
