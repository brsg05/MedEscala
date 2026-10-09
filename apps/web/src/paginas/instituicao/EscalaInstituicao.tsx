import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import {
  formatarCentavos,
  formatarData,
  formatarHora,
  ROTULO_STATUS_PLANTAO,
  type PlantaoResponse,
} from '@medescala/contracts';
import { api } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { ErroDeFormulario } from '@/componentes/Painel';
import { Button } from '@/componentes/ui/button';
import { Etiqueta } from '@/componentes/ui/etiqueta';
import {
  LegendaDeCobertura,
  TrilhoDeCobertura,
  type BlocoDePlantao,
  type EstadoDoBloco,
} from '@/componentes/TrilhoDeCobertura';
import { inicioDoDia, UM_DIA_MS } from '@/lib/datas';
import { AvisoDePendencia } from './AvisoDePendencia';
import { EscalarMedico } from './EscalarMedico';
import { PublicarVaga } from './PublicarVaga';
import { Trilha } from './Trilha';

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** Na perspectiva da instituição, o que importa enxergar é o buraco. */
function estadoParaInstituicao(status: PlantaoResponse['status']): EstadoDoBloco {
  switch (status) {
    case 'ABERTO':
    case 'EM_SELECAO':
      return 'vazio';
    case 'EM_REPASSE':
      return 'repasse';
    case 'CONTESTADO':
      return 'espera';
    default:
      return 'turno';
  }
}

function corDaEtiqueta(
  status: PlantaoResponse['status'],
): 'turno' | 'vazio' | 'repasse' | 'espera' | 'neutro' {
  if (status === 'CANCELADO') return 'neutro';
  return estadoParaInstituicao(status);
}

type Acao =
  | { tipo: 'publicar' }
  | { tipo: 'escalar'; plantao: PlantaoResponse }
  | { tipo: 'trilha'; plantao: PlantaoResponse };

/**
 * F06 e F12 vistos pela chefia — a escala da instituição.
 *
 * É a mesma régua de cobertura do médico, lida do outro lado: aqui o bloco
 * vermelho é a crise do dia, um turno sem ninguém. Daqui a chefia publica a vaga,
 * escala quem se ofereceu (DEC-062) e abre a trilha de qualquer plantão (F23).
 */
export function EscalaInstituicao(): React.JSX.Element {
  const { instituicaoId = '' } = useParams();
  const [dia, setDia] = useState(() => new Date());
  const [acao, setAcao] = useState<Acao | null>(null);

  const zero = useMemo(() => inicioDoDia(dia), [dia]);

  const buscarEstrutura = useCallback(() => api.estrutura(instituicaoId), [instituicaoId]);
  const estrutura = useRecurso(buscarEstrutura, [instituicaoId]);

  const buscarPlantoes = useCallback(
    () =>
      // Um dia para trás: o plantão noturno da véspera invade o dia exibido.
      api.plantoesDaInstituicao(
        instituicaoId,
        new Date(zero.getTime() - UM_DIA_MS),
        new Date(zero.getTime() + UM_DIA_MS),
      ),
    [instituicaoId, zero],
  );
  const plantoes = useRecurso(buscarPlantoes, [instituicaoId, zero.getTime()]);

  const doDia = useMemo(() => {
    const fim = zero.getTime() + UM_DIA_MS;
    return (plantoes.dado ?? []).filter(
      (p) =>
        p.status !== 'CANCELADO' &&
        Date.parse(p.inicio) < fim &&
        Date.parse(p.fim) > zero.getTime(),
    );
  }, [plantoes.dado, zero]);

  const blocos: BlocoDePlantao[] = doDia.map((p) => ({
    id: p.id,
    inicio: p.inicio,
    fim: p.fim,
    setor: `${p.setor.nome} · ${p.executante?.nome ?? 'descoberto'}`,
    estado: estadoParaInstituicao(p.status),
  }));

  const descobertos = doDia.filter(
    (p) => p.status === 'ABERTO' || p.status === 'EM_SELECAO',
  ).length;
  const pendente = estrutura.dado?.instituicao.status === 'PENDENTE';
  const semSetor = (estrutura.dado?.unidades.flatMap((u) => u.setores) ?? []).length === 0;
  const ehHoje = dia.toDateString() === new Date().toDateString();

  function aoConcluir(): void {
    setAcao(null);
    plantoes.recarregar();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="sinal">Escala da instituição</p>

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
              onClick={() => setDia((d) => new Date(d.getTime() - UM_DIA_MS))}
              aria-label="Dia anterior"
            >
              ←
            </Button>
            <Button
              variante="contorno"
              tamanho="pequeno"
              onClick={() => setDia((d) => new Date(d.getTime() + UM_DIA_MS))}
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

      {pendente && <AvisoDePendencia />}

      <ErroDeFormulario mensagem={plantoes.erro ?? estrutura.erro} />

      <section aria-label="Cobertura do dia">
        {plantoes.carregando ? (
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
              if (p !== undefined) setAcao({ tipo: 'trilha', plantao: p });
            }}
          />
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <LegendaDeCobertura perspectiva="instituicao" />
          {descobertos > 0 && (
            <Etiqueta estado="vazio">
              {descobertos} {descobertos === 1 ? 'turno descoberto' : 'turnos descobertos'}
            </Etiqueta>
          )}
        </div>
      </section>

      <div>
        <Button
          className="w-full"
          disabled={pendente || semSetor || estrutura.carregando}
          onClick={() => setAcao({ tipo: 'publicar' })}
        >
          Publicar vaga
        </Button>
        {!pendente && semSetor && !estrutura.carregando && (
          <p className="mt-2 text-center text-xs text-gelo-3">
            Cadastre ao menos um setor em Estrutura para publicar vagas.
          </p>
        )}
      </div>

      {!plantoes.carregando && doDia.length > 0 && (
        <section aria-label="Plantões do dia" className="space-y-2">
          <p className="sinal">Plantões deste dia</p>
          {doDia.map((p) => (
            <article key={p.id} className="rounded-xl border border-borda bg-tinta-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gelo">{p.setor.nome}</p>
                  <p className="dado text-xs text-gelo-3">
                    {formatarHora(p.inicio)}–{formatarHora(p.fim)} ·{' '}
                    {formatarCentavos(p.valorCentavos)}
                  </p>
                </div>
                <Etiqueta estado={corDaEtiqueta(p.status)}>
                  {ROTULO_STATUS_PLANTAO[p.status]}
                </Etiqueta>
              </div>

              <p className="mt-3 text-sm text-gelo-2">
                {p.executante === null ? (
                  <span className="text-vazio">Ninguém escalado</span>
                ) : (
                  <>
                    {p.executante.nome}{' '}
                    <span className="dado text-xs text-gelo-3">
                      CRM/{p.executante.crmUf} {p.executante.crm}
                    </span>
                  </>
                )}
              </p>

              <div className="mt-3 flex gap-2">
                {p.status === 'ABERTO' && (
                  <Button
                    tamanho="pequeno"
                    className="flex-1"
                    disabled={pendente}
                    onClick={() => setAcao({ tipo: 'escalar', plantao: p })}
                  >
                    Escalar médico
                  </Button>
                )}
                <Button
                  variante="contorno"
                  tamanho="pequeno"
                  className="flex-1"
                  onClick={() => setAcao({ tipo: 'trilha', plantao: p })}
                >
                  Trilha
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}

      {!plantoes.carregando && plantoes.erro === null && doDia.length === 0 && (
        <p className="rounded-xl border border-dashed border-borda px-4 py-6 text-center text-sm text-gelo-3">
          Nenhum plantão neste dia.
          {!pendente && !semSetor ? ' Publique uma vaga para abrir o turno.' : ''}
        </p>
      )}

      {acao?.tipo === 'publicar' && estrutura.dado !== null && (
        <PublicarVaga
          estrutura={estrutura.dado}
          diaSugerido={dia}
          aoFechar={() => setAcao(null)}
          aoPublicar={aoConcluir}
        />
      )}
      {acao?.tipo === 'escalar' && (
        <EscalarMedico
          plantao={acao.plantao}
          aoFechar={() => setAcao(null)}
          aoEscalar={aoConcluir}
        />
      )}
      {acao?.tipo === 'trilha' && <Trilha plantao={acao.plantao} aoFechar={() => setAcao(null)} />}
    </div>
  );
}
