import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { FinanceiroResponse, UsuarioAutenticado } from '@medescala/contracts';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { FinanceiroService } from './financeiro.service';

/** F14, F15, F17 — o financeiro de um plantão e o toque que emite a NFS-e (DEC-202). */
@Controller()
export class FinanceiroController {
  constructor(private readonly financeiro: FinanceiroService) {}

  @Get('plantoes/:id/financeiro')
  async doPlantao(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<FinanceiroResponse> {
    return this.financeiro.doPlantao(id, usuario);
  }

  @Perfis('MEDICO')
  @Post('documentos-fiscais/:id/emitir')
  async emitir(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<FinanceiroResponse> {
    return this.financeiro.emitirNfse(id, usuario);
  }
}
