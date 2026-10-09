import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { PendenciasResponse, UsuarioAutenticado } from '@medescala/contracts';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { CredenciamentoService } from '../credenciamento/credenciamento.service';
import { InstituicaoService } from '../escala/instituicao.service';

/**
 * Operador da plataforma — confere o que o cadastro aberto deixa entrar.
 *
 * Com cadastro aberto (DEC-059, provisório), qualquer um cria conta. As duas
 * travas que tornam isso tolerável moram aqui: CRM de médico (RN02) e CNPJ de
 * instituição (DEC-063). Quando o produto virar multi-tenant, este é o módulo que
 * passa a incluir instituições, em vez de só aprová-las.
 */
@Perfis('OPERADOR_PLATAFORMA')
@Controller('operador')
export class OperadorController {
  constructor(
    private readonly credenciamento: CredenciamentoService,
    private readonly instituicao: InstituicaoService,
  ) {}

  @Get('pendencias')
  async pendencias(): Promise<PendenciasResponse> {
    const [instituicoes, medicos] = await Promise.all([
      this.instituicao.pendentes(),
      this.credenciamento.naoVerificados(),
    ]);
    return { instituicoes, medicos };
  }

  @Post('instituicoes/:id/aprovar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async aprovarInstituicao(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.instituicao.aprovar(id, usuario.id);
  }

  @Post('medicos/:id/verificar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verificarMedico(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.credenciamento.verificar(id, usuario.id);
  }
}
