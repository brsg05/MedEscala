import { describe, expect, it } from 'vitest';
import { checkinAberto, checkoutAberto, contestavelAte, podeContestar } from './janelas';

const INICIO = new Date('2026-10-10T10:00:00Z');
const FIM = new Date('2026-10-10T22:00:00Z');
const turno = { inicio: INICIO, fim: FIM };
const min = (n: number): Date => new Date(INICIO.getTime() + n * 60_000);

describe('janelas da F16', () => {
  it('check-in abre exatamente 30 min antes do início (DEC-133)', () => {
    expect(checkinAberto(turno, min(-31))).toBe(false);
    expect(checkinAberto(turno, min(-30))).toBe(true);
    expect(checkinAberto(turno, min(0))).toBe(true);
  });

  it('check-in fecha no fim do plantão', () => {
    expect(checkinAberto(turno, new Date(FIM.getTime() - 1))).toBe(true);
    expect(checkinAberto(turno, FIM)).toBe(false);
  });

  it('check-out só a partir do início, e continua aberto depois do fim', () => {
    expect(checkoutAberto(turno, min(-1))).toBe(false);
    expect(checkoutAberto(turno, min(0))).toBe(true);
    expect(checkoutAberto(turno, new Date(FIM.getTime() + 3_600_000))).toBe(true);
  });

  it('o prazo de contestação conta do check-out (DEC-132)', () => {
    expect(contestavelAte(FIM, 72).toISOString()).toBe('2026-10-13T22:00:00.000Z');
  });

  it('EXECUTADO: contestável só dentro do prazo', () => {
    const ate = contestavelAte(FIM, 72);
    const executado = { status: 'EXECUTADO', fim: FIM, contestavelAte: ate };

    expect(podeContestar(executado, new Date(ate.getTime() - 1))).toBe('sim');
    expect(podeContestar(executado, ate)).toBe('prazo-encerrado');
    // Confirmado pela própria instituição: não há janela.
    expect(podeContestar({ ...executado, contestavelAte: null }, FIM)).toBe('prazo-encerrado');
  });

  it('sem confirmação (DEC-131): contestável depois do fim, nunca antes', () => {
    const confirmado = { status: 'CONFIRMADO', fim: FIM, contestavelAte: null };

    expect(podeContestar(confirmado, new Date(FIM.getTime() - 1))).toBe('estado-invalido');
    expect(podeContestar(confirmado, FIM)).toBe('sim');
    expect(podeContestar({ ...confirmado, status: 'EM_EXECUCAO' }, FIM)).toBe('sim');
  });

  it('estados que não se contestam', () => {
    for (const status of ['ABERTO', 'EM_REPASSE', 'CONTESTADO', 'CANCELADO', 'LIQUIDADO']) {
      expect(podeContestar({ status, fim: FIM, contestavelAte: null }, FIM)).toBe(
        'estado-invalido',
      );
    }
  });
});
