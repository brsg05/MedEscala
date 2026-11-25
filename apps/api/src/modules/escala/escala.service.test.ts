import { describe, expect, it, vi } from 'vitest';
import type { PlantaoResponse } from '@medescala/contracts';
import type { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuditoriaService } from '../auditoria/auditoria.service';
import { EscalaService, type PlantaoCompleto } from './escala.service';

describe('agendaDoMedico', () => {
  it('inclui plantões que atravessam o início da janela e exclui intervalos que apenas encostam', async () => {
    const desde = new Date('2026-11-23T00:00:00Z');
    const ate = new Date('2026-11-30T00:00:00Z');
    const plantoes = [
      { id: 'antes', inicio: new Date('2026-11-22T18:00:00Z'), fim: desde },
      {
        id: 'atravessa',
        inicio: new Date('2026-11-22T20:00:00Z'),
        fim: new Date('2026-11-23T08:00:00Z'),
      },
      {
        id: 'dentro',
        inicio: new Date('2026-11-24T08:00:00Z'),
        fim: new Date('2026-11-24T20:00:00Z'),
      },
      { id: 'depois', inicio: ate, fim: new Date('2026-11-30T08:00:00Z') },
    ];
    const findMany = vi.fn(
      async ({ where }: { where: { inicio: { gte?: Date; lt?: Date }; fim?: { gt?: Date } } }) =>
        plantoes.filter(
          (p) =>
            (where.inicio.gte === undefined || p.inicio >= where.inicio.gte) &&
            (where.inicio.lt === undefined || p.inicio < where.inicio.lt) &&
            (where.fim?.gt === undefined || p.fim > where.fim.gt),
        ),
    );
    const prisma = { plantao: { findMany } } as unknown as PrismaService;
    const service = new EscalaService(prisma, {} as AuditoriaService);
    vi.spyOn(service, 'paraResposta').mockImplementation(
      (p: PlantaoCompleto) => ({ id: p.id }) as PlantaoResponse,
    );

    const agenda = await service.agendaDoMedico('medico', desde, ate);

    expect(agenda.plantoes.map((p) => p.id)).toEqual(['atravessa', 'dentro']);
  });
});
