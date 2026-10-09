import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';
import type { Env } from './shared/config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  configurarApp(app);

  const porta = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(porta);

  new Logger('Bootstrap').log(`API ouvindo em http://localhost:${porta}`);
}

void bootstrap();
