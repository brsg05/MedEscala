import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { TermoResponse, UsuarioAutenticado } from '@medescala/contracts';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { TermoService } from './termo.service';

/** F13 — os termos de um plantão e o PDF de cada um. Quem não participa recebe 404. */
@Controller()
export class TermosController {
  constructor(private readonly termos: TermoService) {}

  @Get('plantoes/:id/termos')
  async listar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<TermoResponse[]> {
    return this.termos.listar(id, usuario);
  }

  @Get('termos/:id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Res() res: Response,
  ): Promise<void> {
    const { arquivo, nome } = await this.termos.pdf(id, usuario);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(arquivo);
  }
}
