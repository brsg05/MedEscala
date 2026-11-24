import { useCallback, useMemo, useState } from 'react';
import { formatarDataHora, formatarCentavos, type PlantaoResponse } from '@medescala/contracts';
import { api } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { Button } from '@/componentes/ui/button';
import { EstadoVazio } from '@/componentes/EstadoVazio';
import { ExecucaoDoPlantao } from '@/componentes/ExecucaoDoPlantao';
import { BotaoTermos } from '@/componentes/Termos';
import { BotaoPagamento } from '@/componentes/Pagamento';
import { CalendarioSemanal, NavegacaoSemanal } from '@/componentes/CalendarioSemanal';
import { FUSO_LOCAL, inicioDaSemana, somarDias } from '@/lib/datas';
import {
  LegendaDeCobertura,
  type BlocoDePlantao,
  type EstadoDoBloco,
} from '@/componentes/TrilhoDeCobertura';
import { PedirRepasse } from './PedirRepasse';

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

/** F05 — agenda unificada. */
export function Escala(): React.JSX.Element {
  const [dia, setDia] = useState(() => new Date());
  const [plantaoEmRepasse, setPlantaoEmRepasse] = useState<PlantaoResponse | null>(null);

  const inicio = useMemo(() => inicioDaSemana(dia), [dia]);
  const fim = useMemo(() => somarDias(inicio, 7), [inicio]);

  const buscar = useCallback(() => api.agenda(inicio, fim), [inicio, fim]);

  const agenda = useRecurso(buscar, [inicio.getTime()]);

  const daSemana = useMemo(() => {
    return (agenda.dado?.plantoes ?? []).filter(
      (p) => Date.parse(p.inicio) < fim.getTime() && Date.parse(p.fim) > inicio.getTime(),
    );
  }, [agenda.dado, inicio, fim]);

  const blocos: BlocoDePlantao[] = daSemana.map((p) => ({
    id: p.id,
    inicio: p.inicio,
    fim: p.fim,
    setor: `${p.setor.nome} · ${p.setor.unidade}`,
    estado: estadoDoBloco(p.status),
  }));

  return (
    <div className="space-y-6">
      <header>
        <p className="sinal">Sua escala</p>

        <NavegacaoSemanal inicio={inicio} aoMudar={setDia} />
      </header>

      {agenda.erro !== null && (
        <p
          role="alert"
          className="rounded-lg border border-vazio/30 bg-vazio-fundo px-3 py-2.5 text-sm text-vazio"
        >
          {agenda.erro}
        </p>
      )}

      <section aria-label="Cobertura da semana">
        {agenda.carregando ? (
          <div
            className="h-24 animate-pulse rounded-lg border border-borda bg-tinta-2"
            aria-label="Carregando escala"
          />
        ) : (
          <CalendarioSemanal
            inicio={inicio}
            blocos={blocos}
            aoSelecionar={(bloco) => {
              const p = daSemana.find((x) => x.id === bloco.id);
              if (p !== undefined && pedivel(p)) setPlantaoEmRepasse(p);
            }}
          />
        )}

        <div className="mt-4">
          <LegendaDeCobertura />
        </div>
      </section>

      {/* Avisa, mas não impede: impedir seria definir jornada (RN03, RN09). */}
      {!agenda.carregando && agenda.erro === null && agenda.dado?.alertaCargaHoraria != null && (
        <p className="rounded-lg border border-espera/30 bg-espera-fundo px-3 py-2.5 text-sm text-espera">
          <strong className="font-semibold">
            {agenda.dado.alertaCargaHoraria.horasContiguas.toFixed(0)}h seguidas.
          </strong>{' '}
          Sua sequência de plantões passa de {agenda.dado.alertaCargaHoraria.limite}h sem intervalo.
        </p>
      )}

      {!agenda.carregando && daSemana.length > 0 && (
        <section aria-label="Plantões da semana" className="space-y-2">
          <p className="sinal">Plantões desta semana</p>
          {daSemana.map((p) => (
            <article key={p.id} className="rounded-xl border border-borda bg-tinta-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gelo">{p.setor.nome}</p>
                  <p className="text-xs text-gelo-3">
                    {p.setor.unidade} · {p.setor.instituicao}
                  </p>
                  <p className="dado text-xs text-gelo-3">
                    {formatarDataHora(p.inicio, FUSO_LOCAL)} – {formatarDataHora(p.fim, FUSO_LOCAL)}
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
                <BotaoPagamento plantaoId={p.id} />
              </div>

              {p.status === 'EM_REPASSE' && (
                <p className="mt-3 text-xs text-repasse">Repasse em andamento.</p>
              )}

              <ExecucaoDoPlantao plantao={p} perspectiva="medico" aoMudar={agenda.recarregar} />
            </article>
          ))}
        </section>
      )}

      {!agenda.carregando && agenda.erro === null && daSemana.length === 0 && (
        <EstadoVazio
          titulo="Semana livre na sua escala"
          descricao="Você não tem plantão nesta semana."
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
