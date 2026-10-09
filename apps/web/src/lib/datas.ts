/**
 * Ponte entre o `<input type="datetime-local">` e o UTC do wire (ADR-018).
 *
 * O campo do navegador trabalha em hora LOCAL e sem fuso ("2026-10-08T19:00").
 * O contrato exige ISO em UTC com `Z`. A conversão acontece aqui e só aqui, para
 * nenhuma tela inventar a sua — é exatamente onde o bug de uma hora entra.
 */
export function paraCampoLocal(data: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${String(data.getFullYear())}-${p(data.getMonth() + 1)}-${p(data.getDate())}T${p(data.getHours())}:${p(data.getMinutes())}`;
}

/** `"2026-10-08T19:00"` (local) → `"2026-10-08T22:00:00.000Z"` (UTC). */
export function doCampoLocal(valor: string): string | null {
  if (valor === '') {
    return null;
  }
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

export const UMA_HORA_MS = 3_600_000;
export const UM_DIA_MS = 24 * UMA_HORA_MS;

export function inicioDoDia(data: Date): Date {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}
