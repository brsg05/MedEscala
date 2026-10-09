import { z } from 'zod';

/**
 * Variáveis de ambiente validadas na subida (ADR-005: uma definição Zod, tipo
 * inferido). Falhar aqui é barato; descobrir que `SUPABASE_SERVICE_ROLE_KEY` está
 * vazia no meio de um login é caro.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),

  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  /** Origem do frontend. Usada pelo CORS e pela validação de `Origin` (D9). */
  WEB_ORIGIN: z.url(),

  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET precisa de ao menos 16 caracteres'),

  /**
   * Redis dos jobs agendados (ADR-027). Ele ACELERA a fila de convites; quem
   * decide é o Postgres (DEC-097) — com o Redis fora, a fila anda no próximo
   * acesso em vez de na hora certa.
   */
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Usado pelo `ConfigModule.forRoot({ validate })`. */
export function validarEnv(bruto: Record<string, unknown>): Env {
  const resultado = EnvSchema.safeParse(bruto);

  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${problemas}`);
  }

  return resultado.data;
}
