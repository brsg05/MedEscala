import { duracaoEmHoras, formatarHora, type InstanteUtc } from '@medescala/contracts';
import { cn } from '@/lib/utils';

export type EstadoDoBloco = 'turno' | 'vazio' | 'repasse' | 'espera';

export interface BlocoDePlantao {
  id: string;
  inicio: InstanteUtc;
  fim: InstanteUtc;
  setor: string;
  estado: EstadoDoBloco;
}

interface Props {
  /** Dia exibido, em UTC. O trilho cobre as 24h locais desse dia. */
  dia: Date;
  blocos: readonly BlocoDePlantao[];
  aoSelecionar?: (bloco: BlocoDePlantao) => void;
}

const CORES: Record<EstadoDoBloco, { barra: string; texto: string; borda: string }> = {
  turno: { barra: 'bg-turno', texto: 'text-turno', borda: 'border-turno/30' },
  vazio: { barra: 'bg-vazio', texto: 'text-vazio', borda: 'border-vazio/30' },
  repasse: { barra: 'bg-repasse', texto: 'text-repasse', borda: 'border-repasse/30' },
  espera: { barra: 'bg-espera', texto: 'text-espera', borda: 'border-espera/30' },
};

/** Marcas de hora a cada 4h — densidade que cabe na largura de um celular. */
const HORAS_MARCADAS = [0, 4, 8, 12, 16, 20, 24] as const;

/**
 * Trilho de cobertura — o elemento-assinatura do produto.
 *
 * Por que uma régua de 24h e não uma lista de cartões: o artefato real deste
 * domínio é a escala, uma grade de horários que hospitais imprimem e penduram na
 * parede. O plantão não é um "item"; é um intervalo que ocupa um pedaço do dia, e
 * o que importa enxergar é onde há buraco. Uma lista esconde exatamente isso.
 *
 * O plantão noturno cruza a meia-noite (19h–07h), então um bloco pode começar
 * neste dia e terminar no outro — a régua recorta no limite do dia e sinaliza a
 * continuação em vez de fingir que o turno acabou às 23h59.
 */
export function TrilhoDeCobertura({ dia, blocos, aoSelecionar }: Props): React.JSX.Element {
  const inicioDoDia = new Date(dia);
  inicioDoDia.setHours(0, 0, 0, 0);
  const fimDoDia = new Date(inicioDoDia.getTime() + 24 * 3600_000);

  function posicao(bloco: BlocoDePlantao): { esquerda: number; largura: number } {
    const i = Math.max(Date.parse(bloco.inicio), inicioDoDia.getTime());
    const f = Math.min(Date.parse(bloco.fim), fimDoDia.getTime());
    const total = 24 * 3600_000;
    return {
      esquerda: ((i - inicioDoDia.getTime()) / total) * 100,
      largura: Math.max(((f - i) / total) * 100, 4),
    };
  }

  return (
    <div className="select-none">
      <div className="relative h-4" aria-hidden="true">
        {HORAS_MARCADAS.map((h) => (
          <span
            key={h}
            className="dado absolute top-0 text-[0.625rem] text-gelo-3"
            style={{
              left: `${String((h / 24) * 100)}%`,
              transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>

      <div className="relative rounded-lg border border-borda bg-tinta-2">
        {HORAS_MARCADAS.slice(1, -1).map((h) => (
          <span
            key={h}
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-borda/60"
            style={{ left: `${String((h / 24) * 100)}%` }}
          />
        ))}

        {blocos.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gelo-3">Nenhum plantão neste dia</p>
        ) : (
          <ul className="relative space-y-1.5 p-1.5">
            {blocos.map((bloco) => {
              const { esquerda, largura } = posicao(bloco);
              const cor = CORES[bloco.estado];
              const cruzaMeiaNoite = Date.parse(bloco.fim) > fimDoDia.getTime();

              return (
                <li key={bloco.id} className="relative h-12">
                  <button
                    type="button"
                    onClick={() => aoSelecionar?.(bloco)}
                    className={cn(
                      'absolute inset-y-0 flex flex-col justify-center overflow-hidden rounded-md',
                      'border bg-tinta-3 px-2 text-left transition-colors hover:bg-borda',
                      cor.borda,
                    )}
                    style={{ left: `${String(esquerda)}%`, width: `${String(largura)}%` }}
                  >
                    <span
                      aria-hidden="true"
                      className={cn('absolute inset-y-0 left-0 w-1', cor.barra)}
                    />
                    <span className={cn('dado text-[0.6875rem] leading-tight', cor.texto)}>
                      {formatarHora(bloco.inicio)}–{formatarHora(bloco.fim)}
                      {cruzaMeiaNoite ? ' →' : ''}
                    </span>
                    <span className="truncate text-xs leading-tight font-medium text-gelo">
                      {bloco.setor}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {blocos.length > 0 && (
        <p className="dado mt-2 text-[0.6875rem] text-gelo-3">
          {blocos.length} plantão(ões) ·{' '}
          {blocos
            .reduce((total, b) => total + duracaoEmHoras({ inicio: b.inicio, fim: b.fim }), 0)
            .toFixed(0)}
          h no dia
        </p>
      )}
    </div>
  );
}

/**
 * Legenda do trilho. Fica separada porque também explica a paleta do app inteiro.
 *
 * As cores são as mesmas nos dois lados; o que muda é a leitura. Para o médico o
 * bloco verde é "seu turno"; para a chefia é "coberto" — e o vermelho, que para o
 * médico quase não aparece, é a crise da chefia: turno sem ninguém.
 */
export function LegendaDeCobertura({
  perspectiva = 'medico',
}: {
  perspectiva?: 'medico' | 'instituicao';
}): React.JSX.Element {
  const itens: ReadonlyArray<{ estado: EstadoDoBloco; rotulo: string }> =
    perspectiva === 'medico'
      ? [
          { estado: 'turno', rotulo: 'Seu turno' },
          { estado: 'repasse', rotulo: 'Em repasse' },
          { estado: 'espera', rotulo: 'Aguardando chefia' },
          { estado: 'vazio', rotulo: 'Descoberto' },
        ]
      : [
          { estado: 'turno', rotulo: 'Coberto' },
          { estado: 'repasse', rotulo: 'Em repasse' },
          { estado: 'espera', rotulo: 'Contestado' },
          { estado: 'vazio', rotulo: 'Descoberto' },
        ];

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {itens.map(({ estado, rotulo }) => (
        <li key={estado} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-sm', CORES[estado].barra)} />
          <span className="text-xs text-gelo-2">{rotulo}</span>
        </li>
      ))}
    </ul>
  );
}
