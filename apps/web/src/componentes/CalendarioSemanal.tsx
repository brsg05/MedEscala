import { formatarData, formatarHora } from '@medescala/contracts';
import { Button } from '@/componentes/ui/button';
import { FUSO_LOCAL, somarDias } from '@/lib/datas';
import { cn } from '@/lib/utils';
import type { BlocoDePlantao, EstadoDoBloco } from './TrilhoDeCobertura';

const ALTURA_HORA = 60;
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'] as const;
const CORES: Record<EstadoDoBloco, string> = {
  turno: 'border-turno/50 bg-turno/25 text-gelo',
  vazio: 'border-vazio/50 bg-vazio-fundo text-gelo',
  repasse: 'border-repasse/50 bg-repasse/25 text-gelo',
  espera: 'border-espera/50 bg-espera-fundo text-gelo',
};

interface Segmento {
  bloco: BlocoDePlantao;
  inicio: number;
  fim: number;
  coluna: number;
  colunas: number;
}

function minutos(data: Date): number {
  return data.getHours() * 60 + data.getMinutes() + data.getSeconds() / 60;
}

function segmentosDoDia(dia: Date, blocos: readonly BlocoDePlantao[]): Segmento[] {
  const inicio = dia.getTime();
  const fim = somarDias(dia, 1).getTime();
  const segmentos = blocos
    .filter((b) => Date.parse(b.inicio) < fim && Date.parse(b.fim) > inicio)
    .map((bloco) => ({
      bloco,
      inicio: Date.parse(bloco.inicio) <= inicio ? 0 : minutos(new Date(bloco.inicio)),
      fim: Date.parse(bloco.fim) >= fim ? 1440 : minutos(new Date(bloco.fim)),
      coluna: 0,
      colunas: 1,
    }))
    .sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);

  let grupo: Segmento[] = [];
  let fins: number[] = [];
  let fimDoGrupo = 0;
  function concluirGrupo(): void {
    for (const segmento of grupo) segmento.colunas = fins.length;
  }
  for (const segmento of segmentos) {
    if (grupo.length > 0 && segmento.inicio >= fimDoGrupo) {
      concluirGrupo();
      grupo = [];
      fins = [];
    }
    let coluna = fins.findIndex((fimDaColuna) => fimDaColuna <= segmento.inicio);
    if (coluna === -1) coluna = fins.length;
    fins[coluna] = segmento.fim;
    segmento.coluna = coluna;
    grupo.push(segmento);
    fimDoGrupo = Math.max(fimDoGrupo, segmento.fim);
  }
  concluirGrupo();
  return segmentos;
}

export function NavegacaoSemanal({
  inicio,
  aoMudar,
}: {
  inicio: Date;
  aoMudar: (data: Date) => void;
}): React.JSX.Element {
  const hoje = new Date();
  const nestaSemana = hoje >= inicio && hoje < somarDias(inicio, 7);
  return (
    <>
      <div className="mt-2 flex items-center justify-between gap-2">
        <h1
          className="min-w-0 text-base font-extrabold tracking-tight text-gelo sm:text-xl"
          style={{ fontFamily: 'var(--font-sinal)' }}
        >
          <span className="dado font-semibold sm:hidden">
            {formatarData(inicio, FUSO_LOCAL).slice(0, 5)} –{' '}
            {formatarData(somarDias(inicio, 6), FUSO_LOCAL)}
          </span>
          <span className="dado hidden font-semibold sm:inline">
            {formatarData(inicio, FUSO_LOCAL)} – {formatarData(somarDias(inicio, 6), FUSO_LOCAL)}
          </span>
        </h1>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variante="contorno"
            tamanho="pequeno"
            onClick={() => aoMudar(somarDias(inicio, -7))}
            aria-label="Semana anterior"
          >
            ←
          </Button>
          <Button
            variante="contorno"
            tamanho="pequeno"
            onClick={() => aoMudar(somarDias(inicio, 7))}
            aria-label="Próxima semana"
          >
            →
          </Button>
        </div>
      </div>
      {!nestaSemana && (
        <button
          type="button"
          onClick={() => aoMudar(new Date())}
          className="mt-2 text-xs font-medium text-turno hover:underline"
        >
          Voltar para hoje
        </button>
      )}
    </>
  );
}

export function CalendarioSemanal({
  inicio,
  blocos,
  aoSelecionar,
}: {
  inicio: Date;
  blocos: readonly BlocoDePlantao[];
  aoSelecionar: (bloco: BlocoDePlantao) => void;
}): React.JSX.Element {
  const dias = DIAS.map((_, indice) => somarDias(inicio, indice));
  const hoje = new Date().toDateString();
  return (
    <div className="max-h-[70vh] overflow-x-hidden overflow-y-auto rounded-lg border border-borda bg-tinta-2">
      <div className="w-full min-w-0">
        <div className="sticky top-0 z-20 grid grid-cols-[38px_repeat(7,minmax(0,1fr))] border-b border-borda bg-tinta-2 sm:grid-cols-[52px_repeat(7,minmax(0,1fr))]">
          <div />
          {dias.map((dia, indice) => (
            <div
              key={dia.toISOString()}
              className={cn(
                'min-w-0 border-l border-borda px-0 py-2 text-center text-xs text-gelo-2 lg:px-2 lg:text-sm',
                dia.toDateString() === hoje && 'text-turno',
              )}
            >
              <span className="block text-xs uppercase">{DIAS[indice]}</span>
              <span
                className="dado font-semibold lg:hidden"
                aria-label={formatarData(dia, FUSO_LOCAL)}
              >
                {dia.getDate()}
              </span>
              <span className="dado hidden font-semibold lg:inline">
                {formatarData(dia, FUSO_LOCAL)}
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[38px_repeat(7,minmax(0,1fr))] sm:grid-cols-[52px_repeat(7,minmax(0,1fr))]">
          <div className="relative" style={{ height: 24 * ALTURA_HORA }} aria-hidden="true">
            {Array.from({ length: 24 }, (_, hora) => (
              <span
                key={hora}
                className="dado absolute right-1 text-[0.625rem] text-gelo-3 sm:right-2 sm:text-xs"
                style={{ top: hora * ALTURA_HORA }}
              >
                {String(hora).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {dias.map((dia) => (
            <div
              key={dia.toISOString()}
              className="relative border-l border-borda"
              style={{ height: 24 * ALTURA_HORA }}
            >
              {Array.from({ length: 24 }, (_, hora) => (
                <div
                  key={hora}
                  className="absolute inset-x-0 border-t border-borda/60"
                  style={{ top: hora * ALTURA_HORA }}
                />
              ))}
              {segmentosDoDia(dia, blocos).map(({ bloco, inicio: de, fim, coluna, colunas }) => (
                <button
                  key={bloco.id}
                  type="button"
                  onClick={() => aoSelecionar(bloco)}
                  aria-label={`${bloco.setor}, ${formatarData(dia, FUSO_LOCAL)}, ${formatarHora(bloco.inicio, FUSO_LOCAL)}–${formatarHora(bloco.fim, FUSO_LOCAL)}`}
                  className={cn(
                    'absolute overflow-hidden rounded border px-px text-left text-[0.625rem] hover:brightness-125 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-turno sm:px-1 sm:text-xs',
                    CORES[bloco.estado],
                  )}
                  style={{
                    top: (de / 60) * ALTURA_HORA,
                    height: Math.max(((fim - de) / 60) * ALTURA_HORA, 1),
                    left: `${String((coluna / colunas) * 100)}%`,
                    width: `${String(100 / colunas)}%`,
                  }}
                >
                  <span className="block truncate font-semibold">{bloco.setor}</span>
                  <span className="dado block truncate">
                    {formatarHora(bloco.inicio, FUSO_LOCAL)}–{formatarHora(bloco.fim, FUSO_LOCAL)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
