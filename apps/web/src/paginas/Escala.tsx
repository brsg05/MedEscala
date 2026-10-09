import { useCallback, useMemo, useState } from 'react';
import { formatarData, formatarCentavos, type PlantaoResponse } from '@medescala/contracts';
import { api } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { Button } from '@/componentes/ui/button';
import { EstadoVazio } from '@/componentes/EstadoVazio';
import { ExecucaoDoPlantao } from '@/componentes/ExecucaoDoPlantao';
import { BotaoTermos } from '@/componentes/Termos';
import {
  LegendaDeCobertura,
  TrilhoDeCobertura,
  type BlocoDePlantao,
  type EstadoDoBloco,
} from '@/componentes/TrilhoDeCobertura';
import { PedirRepasse } from './PedirRepasse';

const DIA_MS = 24 * 3600_000;
const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** A cor do bloco carrega o estado do plantão — é a paleta como informação. */
function estadoDoBloco(status: PlantaoResponse['status']): EstadoDoBloco {
  switch (status) {
    case 'EM_REPASSE':
      return 'repasse';
    case 'ABERTO':
    case 'EM_SELECAO':
      return 'vazio';
    case 'CONTESTADO':
      return 'espera';
    default:
      return 'turno';
  }
}

/** Só se repassa um plantão confirmado que ainda não começou (§8 do guia). */
function pedivel(p: PlantaoResponse): boolean {
  return p.status === 'CONFIRMADO' && Date.parse(p.inicio) > Date.now();
}

/**
 * F05 — agenda unificada.
 *
 * A régua é a estrutura da tela, não um enfeite que aparece quando há dado: ver
 * um dia inteiro sem bloco é a informação "você não tem plantão hoje", e ela
 * precisa ocupar o mesmo espaço que ocuparia um dia cheio.
 */
export function Escala(): React.JSX.Element {
  const [dia, setDia] = useState(() => new Date());
  const [plantaoEmRepasse, setPlantaoEmRepasse] = useState<PlantaoResponse | null>(null);

  const inicioDoDia = useMemo(() => {
    const d = new Date(dia);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [dia]);

  const buscar = useCallback(
    () =>
      // A janela vai de um dia antes até um dia depois: plantão noturno começa
      // na véspera e invade o dia exibido.
      api.agenda(
        new Date(inicioDoDia.getTime() - DIA_MS),
        new Date(inicioDoDia.getTime() + 2 * DIA_MS),
      ),
    [inicioDoDia],
  );

  const agenda = useRecurso(buscar, [inicioDoDia.getTime()]);

  const doDia = useMemo(() => {
    const fimDoDia = inicioDoDia.getTime() + DIA_MS;
    return (agenda.dado?.plantoes ?? []).filter(
      (p) => Date.parse(p.inicio) < fimDoDia && Date.parse(p.fim) > inicioDoDia.getTime(),
    );
  }, [agenda.dado, inicioDoDia]);

  const blocos: BlocoDePlantao[] = doDia.map((p) => ({
    id: p.id,
    inicio: p.inicio,
    fim: p.fim,
    setor: `${p.setor.nome} · ${p.setor.unidade}`,
    estado: estadoDoBloco(p.status),
  }));

  const ehHoje = dia.toDateString() === new Date().toDateString();

  function mover(dias: number): void {
    setDia((atual) => new Date(atual.getTime() + dias * DIA_MS));
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="sinal">Sua escala</p>

        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h1
            className="text-2xl font-extrabold tracking-tight text-gelo"
            style={{ fontFamily: 'var(--font-sinal)' }}
          >
            {DIAS_DA_SEMANA[dia.getDay()]}{' '}
            <span className="dado font-semibold">{formatarData(dia)}</span>
          </h1>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variante="contorno"
              tamanho="pequeno"
              onClick={() => mover(-1)}
              aria-label="Dia anterior"
            >
              ←
            </Button>
            <Button
              variante="contorno"
              tamanho="pequeno"
              onClick={() => mover(1)}
              aria-label="Próximo dia"
            >
              →
            </Button>
          </div>
        </div>

        {!ehHoje && (
          <button
            type="button"
            onClick={() => setDia(new Date())}
            className="mt-2 text-xs font-medium text-turno hover:underline"
          >
            Voltar para hoje
          </button>
        )}
      </header>

      {agenda.erro !== null && (
        <p
          role="alert"
          className="rounded-lg border border-vazio/30 bg-vazio-fundo px-3 py-2.5 text-sm text-vazio"
        >
          {agenda.erro}
        </p>
      )}

      <section aria-label="Cobertura do dia">
        {agenda.carregando ? (
          <div
            className="h-24 animate-pulse rounded-lg border border-borda bg-tinta-2"
            aria-label="Carregando escala"
          />
        ) : (
          <TrilhoDeCobertura
            dia={dia}
            blocos={blocos}
            aoSelecionar={(bloco) => {
              const p = doDia.find((x) => x.id === bloco.id);
              if (p !== undefined && pedivel(p)) setPlantaoEmRepasse(p);
            }}
          />
        )}

        <div className="mt-4">
          <LegendaDeCobertura />
        </div>
      </section>

      {/*
        RN03, metade não-bloqueante: a plataforma AVISA que a sequência passa de
        24h, mas não impede. Impedir seria definir jornada, o que a RN09 proíbe.
      */}
      {agenda.dado?.alertaCargaHoraria != null && (
        <p className="rounded-lg border border-espera/30 bg-espera-fundo px-3 py-2.5 text-sm text-espera">
          <strong className="font-semibold">
            {agenda.dado.alertaCargaHoraria.horasContiguas.toFixed(0)}h seguidas.
          </strong>{' '}
          Sua sequência de plantões passa de {agenda.dado.alertaCargaHoraria.limite}h sem intervalo.
        </p>
      )}

      {!agenda.carregando && doDia.length > 0 && (
        <section aria-label="Plantões do dia" className="space-y-2">
          <p className="sinal">Plantões deste dia</p>
          {doDia.map((p) => (
            <article key={p.id} className="rounded-xl border border-borda bg-tinta-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gelo">{p.setor.nome}</p>
                  <p className="text-xs text-gelo-3">
                    {p.setor.unidade} · {p.setor.instituicao}
                  </p>
                </div>
                <p className="dado shrink-0 text-sm font-semibold text-gelo">
                  {formatarCentavos(p.valorCentavos)}
                </p>
              </div>

              <div className="mt-3 flex gap-2">
                {pedivel(p) && (
                  <Button
                    variante="contorno"
                    tamanho="pequeno"
                    className="flex-1"
                    onClick={() => setPlantaoEmRepasse(p)}
                  >
                    Pedir repasse
                  </Button>
                )}
                <BotaoTermos plantaoId={p.id} />
              </div>

              {p.status === 'EM_REPASSE' && (
                <p className="mt-3 text-xs text-repasse">
                  Repasse em andamento — você segue responsável até a chefia aprovar.
                </p>
              )}

              <ExecucaoDoPlantao plantao={p} perspectiva="medico" aoMudar={agenda.recarregar} />
            </article>
          ))}
        </section>
      )}

      {!agenda.carregando && agenda.erro === null && doDia.length === 0 && (
        <EstadoVazio
          titulo="Dia livre na sua escala"
          descricao="Quando uma instituição escalar você, o plantão aparece como bloco na régua acima — e é dali que você abre um pedido de repasse."
          funcoes="F05 agenda · F06 vagas"
          sprint="Sprints 1–2"
        />
      )}

      {plantaoEmRepasse !== null && (
        <PedirRepasse
          plantao={plantaoEmRepasse}
          aoFechar={() => setPlantaoEmRepasse(null)}
          aoAbrir={() => {
            setPlantaoEmRepasse(null);
            agenda.recarregar();
          }}
        />
      )}
    </div>
  );
}
