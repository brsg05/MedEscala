import { ANTECEDENCIA_DO_CHECKIN_MS } from '@medescala/contracts';

/**
 * Janelas da F16, sem banco: o que pode acontecer com um plantão a esta hora.
 *
 * Funções puras para que cada fronteira (30 min antes, o fim, o fim do prazo de
 * contestação) tenha teste próprio sem precisar de relógio falso.
 */

interface Turno {
  inicio: Date;
  fim: Date;
}

/** DEC-133 — de 30 min antes do início até o fim do plantão. */
export function checkinAberto(t: Turno, agora: Date): boolean {
  return agora.getTime() >= t.inicio.getTime() - ANTECEDENCIA_DO_CHECKIN_MS && agora < t.fim;
}

/**
 * Check-out a partir do início — nunca antes, ou o plantão "cumprido" teria
 * durado zero. Pode ser depois do fim: quem esqueceu de marcar ainda marca.
 */
export function checkoutAberto(t: Turno, agora: Date): boolean {
  return agora >= t.inicio;
}

/** DEC-132 — a janela de contestação conta a partir do check-out. */
export function contestavelAte(checkout: Date, prazoHoras: number): Date {
  return new Date(checkout.getTime() + prazoHoras * 3_600_000);
}

/**
 * A instituição contesta um check-out dentro do prazo, ou um plantão que
 * terminou sem confirmação (DEC-131) — esse, a qualquer momento: não há janela
 * correndo, porque ninguém afirmou nada que precise ser contestado a tempo.
 */
export function podeContestar(
  p: { status: string; fim: Date; contestavelAte: Date | null },
  agora: Date,
): 'sim' | 'prazo-encerrado' | 'estado-invalido' {
  if (p.status === 'EXECUTADO') {
    if (p.contestavelAte === null || agora >= p.contestavelAte) {
      return 'prazo-encerrado';
    }
    return 'sim';
  }
  if ((p.status === 'CONFIRMADO' || p.status === 'EM_EXECUCAO') && p.fim <= agora) {
    return 'sim';
  }
  return 'estado-invalido';
}
