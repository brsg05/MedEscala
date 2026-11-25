import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarioSemanal } from './CalendarioSemanal';
import type { BlocoDePlantao } from './TrilhoDeCobertura';

afterEach(cleanup);

function data(dia: number, hora: number): string {
  return new Date(2026, 10, dia, hora).toISOString();
}

describe('CalendarioSemanal', () => {
  const inicio = new Date(2026, 10, 23);
  const noturno: BlocoDePlantao = {
    id: 'noturno',
    inicio: data(22, 20),
    fim: data(23, 8),
    setor: 'Noturno',
    estado: 'turno',
  };
  const simultaneo: BlocoDePlantao = {
    id: 'simultaneo',
    inicio: data(23, 6),
    fim: data(23, 12),
    setor: 'Simultâneo',
    estado: 'vazio',
  };

  it('mostra dia e mês nas colunas, preservando a data completa para acessibilidade', () => {
    render(<CalendarioSemanal inicio={inicio} blocos={[]} aoSelecionar={() => undefined} />);

    expect(screen.getByLabelText('23/11/2026').textContent).toBe('23/11');
    expect(screen.getByLabelText('29/11/2026').textContent).toBe('29/11');
  });

  it('recorta turnos que atravessam dias e posiciona sobreposições lado a lado', () => {
    const selecionar = vi.fn();
    render(
      <CalendarioSemanal
        inicio={inicio}
        blocos={[noturno, simultaneo]}
        aoSelecionar={selecionar}
      />,
    );

    const primeiro = screen.getByRole('button', { name: /Noturno/u });
    const segundo = screen.getByRole('button', { name: /Simultâneo/u });
    expect(primeiro.style.top).toBe('0px');
    expect(primeiro.style.height).toBe('240px');
    expect(primeiro.style.width).toBe('50%');
    expect(segundo.style.left).toBe('50%');
    fireEvent.click(primeiro);
    expect(selecionar).toHaveBeenCalledWith(noturno);
  });

  it('exibe um turno em cada dia atravessado, sem incluir o dia em que termina à meia-noite', () => {
    render(
      <CalendarioSemanal
        inicio={inicio}
        blocos={[{ ...noturno, inicio: data(23, 20), fim: data(25, 0) }]}
        aoSelecionar={() => undefined}
      />,
    );

    const segmentos = screen.getAllByRole('button', { name: /Noturno/u });
    expect(segmentos).toHaveLength(2);
    expect(segmentos[0]?.style.top).toBe('600px');
    expect(segmentos[1]?.style.height).toBe('720px');
  });
});
