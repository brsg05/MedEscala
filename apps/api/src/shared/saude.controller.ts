import { Controller, Get } from '@nestjs/common';
import { Publico } from '../modules/auth/decorators/publico.decorator';
import { PrismaService } from './prisma/prisma.service';

/**
 * Sonda de saúde. Confere o banco de verdade — um endpoint que só devolve `ok`
 * sem tocar em nada mente exatamente quando mais importa.
 */
@Controller('saude')
export class SaudeController {
  constructor(private readonly prisma: PrismaService) {}

  @Publico()
  @Get()
  async verificar(): Promise<{ status: string; banco: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', banco: 'ok' };
    } catch {
      return { status: 'degradado', banco: 'indisponivel' };
    }
  }
}
