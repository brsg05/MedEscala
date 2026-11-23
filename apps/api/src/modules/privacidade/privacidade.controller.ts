import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  AceitarPoliticaRequest,
  type PoliticaResponse,
  type SituacaoDoAceiteResponse,
  type UsuarioAutenticado,
} from '@medescala/contracts';
import { ZodValidationPipe } from '../../shared/validacao/zod-validation.pipe';
import { Publico } from '../auth/decorators/publico.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { PrivacidadeService } from './privacidade.service';
import { SemAceiteDaPolitica } from './sem-aceite.decorator';

/** F24 — política de privacidade e aceite (ADR-015). */
@Controller('privacidade')
@SemAceiteDaPolitica()
export class PrivacidadeController {
  constructor(private readonly privacidade: PrivacidadeService) {}

  /** Pública: quem vai criar conta precisa ler a política antes. */
  @Publico()
  @Get('politica')
  politica(): PoliticaResponse {
    return this.privacidade.politica();
  }

  @Get('aceite')
  async situacao(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<SituacaoDoAceiteResponse> {
    return this.privacidade.situacao(usuario.id);
  }

  @Post('aceite')
  @HttpCode(HttpStatus.OK)
  async aceitar(
    @Body(new ZodValidationPipe(AceitarPoliticaRequest)) corpo: AceitarPoliticaRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<SituacaoDoAceiteResponse> {
    return this.privacidade.aceitar(usuario.id, corpo.versao);
  }
}
