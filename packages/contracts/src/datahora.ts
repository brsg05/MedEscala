import { z } from 'zod';

/**
 * Data e hora trafegam como **ISO 8601 em UTC** (sufixo `Z`), e são persistidas como
 * `timestamptz` (D11).
 *
 * Motivo: a RN03 bloqueia sobreposição de horários e alerta quando plantões contíguos
 * passam de 24h. Plantão noturno cruza meia-noite e um médico pode ter vínculo em mais
 * de um município — comparar horário local é como o bug de uma hora entra. A conversão
 * para fuso de exibição acontece **só** na camada de apresentação.
 */
export const FUSO_PADRAO = 'America/Recife';

/** Instante em UTC. `z.iso.datetime()` recusa offset: exige o `Z`. */
export const InstanteUtc = z.iso.datetime();
export type InstanteUtc = z.infer<typeof InstanteUtc>;

/** Intervalo fechado-aberto `[inicio, fim)`, que é como plantão contíguo deve ser tratado. */
export const Intervalo = z
  .strictObject({
    inicio: InstanteUtc,
    fim: InstanteUtc,
  })
  .refine((i) => Date.parse(i.inicio) < Date.parse(i.fim), {
    message: 'O fim do intervalo deve ser posterior ao início',
    path: ['fim'],
  });
export type Intervalo = z.infer<typeof Intervalo>;

function formatador(fuso: string, opcoes: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, ...opcoes });
}

/** `"2026-09-12T22:30:00Z"` → `"12/09/2026"` em `America/Recife`. */
export function formatarData(instante: InstanteUtc | Date, fuso = FUSO_PADRAO): string {
  return formatador(fuso, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(instante),
  );
}

/** `"2026-09-12T22:30:00Z"` → `"19:30"` em `America/Recife`. */
export function formatarHora(instante: InstanteUtc | Date, fuso = FUSO_PADRAO): string {
  return formatador(fuso, { hour: '2-digit', minute: '2-digit' }).format(new Date(instante));
}

/**
 * `"2026-09-12T22:30:00Z"` → `"12/09/2026 19:30"` em `America/Recife`.
 *
 * Composto a partir de `formatarData` e `formatarHora` em vez de um único
 * `Intl.DateTimeFormat`: o formato pt-BR completo insere vírgula entre data e hora
 * (`"12/09/2026, 19:30"`), que não é o que se quer numa grade de escala. Compor também
 * garante que as três funções não divirjam entre si.
 */
export function formatarDataHora(instante: InstanteUtc | Date, fuso = FUSO_PADRAO): string {
  return `${formatarData(instante, fuso)} ${formatarHora(instante, fuso)}`;
}

/**
 * Duração em horas, calculada em UTC. Primitivo da RN03 (limite de 24h contíguas) —
 * fica aqui porque api e web precisam chegar ao mesmo número.
 */
export function duracaoEmHoras(intervalo: Intervalo): number {
  const ms = Date.parse(intervalo.fim) - Date.parse(intervalo.inicio);
  return ms / 3_600_000;
}
