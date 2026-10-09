import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  BuscaPorCrmQuery,
  CriarDisponibilidadeRequest,
  type CandidatoResponse,
  CriarMedicoRequest,
  DadosFiscaisRequest,
  type DisponibilidadeResponse,
  type MedicoResponse,
  type UsuarioAutenticado,
} from '@medescala/contracts';
import { ZodValidationPipe } from '../../shared/validacao/zod-validation.pipe';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { CredenciamentoService } from './credenciamento.service';

@Controller('medicos')
export class CredenciamentoController {
  constructor(private readonly credenciamento: CredenciamentoService) {}

  /** F01 — cadastro do médico. */
  @Perfis('MEDICO')
  @Post()
  async cadastrar(
    @Body(new ZodValidationPipe(CriarMedicoRequest)) corpo: CriarMedicoRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<MedicoResponse> {
    return this.credenciamento.cadastrar(usuario.id, corpo);
  }

  /** DEC-091 — apontamento individual do substituto por CRM + UF exato. */
  // DEC-091 — o titular aponta no repasse; a instituição aponta na vaga (F10).
  @Perfis('MEDICO', 'ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Get('busca')
  async buscarPorCrm(
    @Query(new ZodValidationPipe(BuscaPorCrmQuery)) consulta: BuscaPorCrmQuery,
  ): Promise<CandidatoResponse> {
    return this.credenciamento.buscarPorCrm(consulta.crm, consulta.uf);
  }

  @Perfis('MEDICO')
  @Get('me')
  async meuCadastro(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<MedicoResponse> {
    return this.credenciamento.meuCadastro(usuario.id);
  }

  /** F02 — dados fiscais. Alimentam o cálculo de retenções do Sprint 4. */
  @Perfis('MEDICO')
  @Put('me/dados-fiscais')
  async dadosFiscais(
    @Body(new ZodValidationPipe(DadosFiscaisRequest)) corpo: DadosFiscaisRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<MedicoResponse> {
    return this.credenciamento.atualizarDadosFiscais(usuario.id, corpo);
  }

  /** F04 — declarar disponibilidade. */
  @Perfis('MEDICO')
  @Post('me/disponibilidades')
  async declarar(
    @Body(new ZodValidationPipe(CriarDisponibilidadeRequest)) corpo: CriarDisponibilidadeRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<DisponibilidadeResponse> {
    return this.credenciamento.declararDisponibilidade(usuario.id, corpo);
  }

  @Perfis('MEDICO')
  @Get('me/disponibilidades')
  async listar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<DisponibilidadeResponse[]> {
    return this.credenciamento.listarDisponibilidades(usuario.id);
  }

  @Perfis('MEDICO')
  @Delete('me/disponibilidades/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remover(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.credenciamento.removerDisponibilidade(usuario.id, id);
  }
}
