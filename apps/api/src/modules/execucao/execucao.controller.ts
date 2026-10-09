import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ContestarPlantaoRequest,
  ResolverContestacaoRequest,
  ResponderContestacaoRequest,
  type PlantaoResponse,
  type UsuarioAutenticado,
} from '@medescala/contracts';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../../shared/validacao/zod-validation.pipe';
import { ExecucaoService } from './execucao.service';

/**
 * F16 — rotas da execução. As do executante pedem perfil MEDICO; as da
 * instituição, CHEFIA_ESCALA — e o serviço confere de QUAL instituição.
 */
@Controller('plantoes/:id')
export class ExecucaoController {
  constructor(private readonly execucao: ExecucaoService) {}

  @Perfis('MEDICO')
  @Post('execucao/inicio')
  async checkin(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.execucao.checkin(id, usuario);
  }

  @Perfis('MEDICO')
  @Post('execucao/fim')
  async checkout(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.execucao.checkout(id, usuario);
  }

  @Perfis('CHEFIA_ESCALA')
  @Post('execucao/confirmar')
  async confirmar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.execucao.confirmar(id, usuario);
  }

  @Perfis('CHEFIA_ESCALA')
  @Post('contestacao')
  async contestar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ContestarPlantaoRequest)) corpo: ContestarPlantaoRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.execucao.contestar(id, usuario, corpo.justificativa);
  }

  @Perfis('MEDICO')
  @Post('contestacao/resposta')
  async responder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResponderContestacaoRequest)) corpo: ResponderContestacaoRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.execucao.responder(id, usuario, corpo.resposta);
  }

  @Perfis('CHEFIA_ESCALA')
  @Post('contestacao/resolucao')
  async resolver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResolverContestacaoRequest)) corpo: ResolverContestacaoRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.execucao.resolver(id, usuario, corpo.resultado, corpo.nota);
  }
}
