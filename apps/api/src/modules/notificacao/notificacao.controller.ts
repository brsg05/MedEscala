import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { NotificacoesResponse, UsuarioAutenticado } from '@medescala/contracts';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { NotificacaoService } from './notificacao.service';

/**
 * F22 — o sino. Sem `@Perfis`: todo usuário autenticado tem as suas, e cada um
 * só enxerga as próprias.
 */
@Controller('notificacoes')
export class NotificacaoController {
  constructor(private readonly notificacoes: NotificacaoService) {}

  @Get()
  async listar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<NotificacoesResponse> {
    return this.notificacoes.listar(usuario.id);
  }

  @Post('lidas')
  @HttpCode(HttpStatus.NO_CONTENT)
  async marcarTodas(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<void> {
    await this.notificacoes.marcarTodasLidas(usuario.id);
  }

  @Post(':id/lida')
  @HttpCode(HttpStatus.NO_CONTENT)
  async marcar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.notificacoes.marcarLida(usuario.id, id);
  }
}
