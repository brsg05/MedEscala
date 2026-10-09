import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { Env } from './shared/config/env';

/**
 * Configuração de runtime compartilhada entre `main.ts` e os testes e2e.
 *
 * Existe para evitar a divergência clássica: o teste sobe o app sem `cookieParser`
 * ou sem CORS, passa, e o comportamento real é outro. Aqui os dois caminhos usam
 * literalmente o mesmo código.
 */
export function configurarApp(app: INestApplication): void {
  const config = app.get(ConfigService<Env, true>);

  // Sem isto os guards não enxergam os cookies httpOnly da sessão (D9).
  app.use(cookieParser(config.get('COOKIE_SECRET', { infer: true })));

  // `credentials: true` é o que autoriza o navegador a mandar os cookies de
  // :5173 para :3000. Sem isso o login "funciona" e nenhuma rota protegida
  // enxerga a sessão.
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });

  // Sem `ValidationPipe` global de propósito: ele depende de `class-validator`, e o
  // ADR-005 escolheu Zod exatamente para não manter DTO duplicado. A validação é
  // feita por rota com `ZodValidationPipe`, usando o MESMO schema que o web importa.
}
