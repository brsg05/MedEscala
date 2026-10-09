import { describe, expect, it } from 'vitest';
import {
  encontrarSobreposicao,
  excedeLimiteContiguo,
  horasContiguasComOTurno,
  respeitaAntecedenciaMinima,
  sobrepoe,
} from './agenda.rules';

/** 19h–07h em Recife (UTC-3) = 22:00Z do dia até 10:00Z do dia seguinte. */
function turno(inicioIso: string, fimIso: string): { inicio: Date; fim: Date } {
  return { inicio: new Date(inicioIso), fim: new Date(fimIso) };
}

const NOTURNO_12 = turno('2026-09-12T22:00:00Z', '2026-09-13T10:00:00Z');
const DIURNO_SEGUINTE_12 = turno('2026-09-13T10:00:00Z', '2026-09-13T22:00:00Z');

describe('RN03 — sobreposição de horários', () => {
  it('detecta sobreposição parcial', () => {
    expect(sobrepoe(NOTURNO_12, turno('2026-09-13T06:00:00Z', '2026-09-13T18:00:00Z'))).toBe(true);
  });

  it('detecta turno contido em outro', () => {
    expect(sobrepoe(NOTURNO_12, turno('2026-09-13T00:00:00Z', '2026-09-13T02:00:00Z'))).toBe(true);
  });

  it('NÃO considera sobreposição turnos que apenas encostam', () => {
    // O plantão termina 10:00 e o outro começa 10:00. A passagem de plantão é
    // instantânea no modelo; tratar como conflito impediria o turno seguinte.
    expect(sobrepoe(NOTURNO_12, DIURNO_SEGUINTE_12)).toBe(false);
  });

  it('é simétrica', () => {
    const outro = turno('2026-09-13T06:00:00Z', '2026-09-13T18:00:00Z');
    expect(sobrepoe(NOTURNO_12, outro)).toBe(sobrepoe(outro, NOTURNO_12));
  });

  it('encontra o turno conflitante numa agenda', () => {
    const agenda = [NOTURNO_12, DIURNO_SEGUINTE_12];
    const conflito = encontrarSobreposicao(
      turno('2026-09-13T08:00:00Z', '2026-09-13T12:00:00Z'),
      agenda,
    );
    expect(conflito).not.toBeNull();
  });

  it('devolve null quando a agenda está livre', () => {
    expect(
      encontrarSobreposicao(turno('2026-09-20T22:00:00Z', '2026-09-21T10:00:00Z'), [NOTURNO_12]),
    ).toBeNull();
  });
});

describe('RN03 — limite de 24h contíguas', () => {
  it('soma turnos colados que atravessam a meia-noite', () => {
    // Dois plantões de 12h encostados = 24h ininterruptas. Uma soma por dia de
    // calendário veria "12h no dia 12 e 12h no dia 13" e não acusaria nada.
    expect(horasContiguasComOTurno(DIURNO_SEGUINTE_12, [NOTURNO_12])).toBe(24);
  });

  it('não acusa exatamente 24h — o limite é ultrapassar', () => {
    expect(excedeLimiteContiguo(DIURNO_SEGUINTE_12, [NOTURNO_12])).toBe(false);
  });

  it('acusa quando a sequência passa de 24h', () => {
    const terceiro = turno('2026-09-13T22:00:00Z', '2026-09-14T04:00:00Z');
    expect(excedeLimiteContiguo(terceiro, [NOTURNO_12, DIURNO_SEGUINTE_12])).toBe(true);
  });

  it('não soma turnos separados por intervalo de descanso', () => {
    const depoisDeFolga = turno('2026-09-15T22:00:00Z', '2026-09-16T10:00:00Z');
    expect(horasContiguasComOTurno(depoisDeFolga, [NOTURNO_12])).toBe(12);
  });
});

describe('F07 — antecedência mínima do repasse', () => {
  const agora = new Date('2026-09-12T12:00:00Z');

  it('aceita pedido com folga maior que o mínimo', () => {
    expect(respeitaAntecedenciaMinima(new Date('2026-09-14T12:00:00Z'), 24, agora)).toBe(true);
  });

  it('aceita exatamente no limite', () => {
    expect(respeitaAntecedenciaMinima(new Date('2026-09-13T12:00:00Z'), 24, agora)).toBe(true);
  });

  it('recusa pedido em cima da hora', () => {
    expect(respeitaAntecedenciaMinima(new Date('2026-09-12T20:00:00Z'), 24, agora)).toBe(false);
  });

  it('recusa plantão que já começou', () => {
    expect(respeitaAntecedenciaMinima(new Date('2026-09-12T06:00:00Z'), 24, agora)).toBe(false);
  });
});
