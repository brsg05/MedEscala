import { Controller, Get, Post } from '@nestjs/common';
import { Perfis } from '../../src/modules/auth/decorators/perfis.decorator';

/**
 * Controller existente APENAS nos testes e2e.
 *
 * O critério de aceite do Sprint 0 fala em "rota protegida devolve 401 sem token e
 * 403 com perfil errado", mas o Sprint 0 não entrega nenhuma função de negócio —
 * não há rota real com `@Perfis` ainda. Esta serve de alvo sem contaminar o código
 * de produção com um endpoint de mentira.
 */
@Controller('_teste')
export class RotaProtegidaController {
  /** Exige sessão, mas nenhum perfil específico. */
  @Get('autenticado')
  autenticado(): { ok: true } {
    return { ok: true };
  }

  /** Espelha a F11: aprovação de substituição é da chefia de escala. */
  @Perfis('CHEFIA_ESCALA')
  @Get('chefia')
  somenteChefia(): { ok: true } {
    return { ok: true };
  }

  /** Mutação sem `@SemCsrf`: serve para exercitar o double-submit. */
  @Perfis('CHEFIA_ESCALA')
  @Post('chefia')
  mutacaoDeChefia(): { ok: true } {
    return { ok: true };
  }
}
