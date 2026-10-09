import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/configurar-app';
import { RotaProtegidaController } from './rota-protegida.controller';

/**
 * Sobe o app real (mesmos guards globais, mesmo filtro, mesma configuração de
 * `configurarApp`) e acrescenta só o controller-alvo dos testes.
 */
export async function criarAppDeTeste(): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [RotaProtegidaController],
  }).compile();

  const app = modulo.createNestApplication();
  configurarApp(app);
  await app.init();

  return app;
}

/** Extrai os cookies de um `set-cookie` para reenviar na próxima requisição. */
export function cookiesDe(resposta: { headers: Record<string, unknown> }): string[] {
  const bruto = resposta.headers['set-cookie'];
  const lista = Array.isArray(bruto) ? (bruto as string[]) : [];
  return lista.map((c) => c.split(';')[0] ?? '');
}

export function valorDoCookie(cookies: readonly string[], nome: string): string | undefined {
  const achado = cookies.find((c) => c.startsWith(`${nome}=`));
  return achado?.slice(nome.length + 1);
}
