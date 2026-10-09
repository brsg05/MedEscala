import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
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

/**
 * Apaga os plantões que uma suíte criou no setor de teste — e os avisos (F22)
 * que eles geraram. Sem a segunda parte, a `chefia@` da demonstração ficaria
 * com "substituição aguardando aprovação" de plantões que já não existem: o
 * aviso guarda o id da entidade, mas não tem FK para ela.
 */
export async function limparPlantoesDoSetor(prisma: PrismaClient, setorId: string): Promise<void> {
  const plantoes = await prisma.plantao.findMany({
    where: { escala: { setorId } },
    select: { id: true, repasses: { select: { id: true } } },
  });
  const ids = plantoes.flatMap((p) => [p.id, ...p.repasses.map((r) => r.id)]);

  await prisma.notificacao.deleteMany({ where: { entidadeId: { in: ids } } });
  await prisma.plantao.deleteMany({ where: { escala: { setorId } } });
}
