import { useCallback, useState, type FormEvent } from 'react';
import { Crm, UfBrasileira, type CandidatoResponse } from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';

export const LIMITE_DA_FILA = 5;

interface Props {
  plantaoId: string;
  fila: readonly CandidatoResponse[];
  aoMudar: (fila: CandidatoResponse[]) => void;
  /** Quem já foi convidado nesta fila e não pode voltar a ela. */
  excluir?: readonly string[];
  /**
   * De onde vem a lista de quem se ofereceu: no repasse, os substitutos (para o
   * titular); na vaga, os candidatos (para a chefia, F10). O padrão é o repasse.
   */
  buscarOferecidos?: (plantaoId: string) => Promise<CandidatoResponse[]>;
  /** O que acontece se ninguém for indicado — muda entre repasse e vaga. */
  semIndicacao?: string;
}

const SEM_INDICACAO_NO_REPASSE =
  'Ninguém indicado. Sem indicação, o convite é aberto: o sistema chama, 5 por vez, quem se ofereceu para este horário.';

/**
 * Monta a fila de convites da Forma 1 (DEC-087, DEC-089).
 *
 * Duas entradas para a mesma fila: a lista de quem se ofereceu para o horário
 * (DEC-062) e o apontamento de um colega por CRM + UF exato (DEC-091), que não
 * exige disponibilidade declarada (DEC-092). O número ao lado de cada nome é a
 * ordem REAL em que os convites saem, um por vez — não é decoração.
 */
export function MontadorDeFila({
  plantaoId,
  fila,
  aoMudar,
  excluir = [],
  buscarOferecidos = api.substitutos,
  semIndicacao = SEM_INDICACAO_NO_REPASSE,
}: Props): React.JSX.Element {
  const buscar = useCallback(() => buscarOferecidos(plantaoId), [plantaoId, buscarOferecidos]);
  const oferecidos = useRecurso(buscar, [plantaoId]);

  const cheia = fila.length >= LIMITE_DA_FILA;
  const naFila = (id: string): boolean => fila.some((c) => c.id === id);

  function adicionar(c: CandidatoResponse): void {
    if (!cheia && !naFila(c.id)) {
      aoMudar([...fila, c]);
    }
  }

  function remover(id: string): void {
    aoMudar(fila.filter((c) => c.id !== id));
  }

  function subir(i: number): void {
    if (i === 0) return;
    const nova = [...fila];
    const [item] = nova.splice(i, 1);
    if (item !== undefined) nova.splice(i - 1, 0, item);
    aoMudar(nova);
  }

  const disponiveis = (oferecidos.dado ?? []).filter((c) => !excluir.includes(c.id));

  return (
    <div className="space-y-4">
      <section aria-label="Fila de convites">
        <p className="sinal mb-2">
          Fila de convites{' '}
          <span className="dado normal-case">
            ({fila.length}/{LIMITE_DA_FILA})
          </span>
        </p>

        {fila.length === 0 ? (
          <p className="rounded-lg border border-dashed border-borda px-3 py-3 text-xs leading-relaxed text-gelo-3">
            {semIndicacao}
          </p>
        ) : (
          <ol className="space-y-1.5">
            {fila.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg bg-tinta-3 px-3 py-2">
                <span className="dado w-5 shrink-0 text-sm font-semibold text-repasse">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gelo">{c.nome}</span>
                  <span className="dado block text-[0.6875rem] text-gelo-3">
                    CRM/{c.crmUf} {c.crm}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => subir(i)}
                  disabled={i === 0}
                  aria-label={`Subir ${c.nome} na fila`}
                  className="rounded px-2 py-1 text-gelo-3 hover:bg-borda hover:text-gelo disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => remover(c.id)}
                  aria-label={`Tirar ${c.nome} da fila`}
                  className="rounded px-2 py-1 text-gelo-3 hover:bg-borda hover:text-vazio"
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-2 text-xs text-gelo-3">
          Um por vez, nesta ordem. Cada pessoa tem um prazo curto para responder; se recusar ou não
          responder, a vez passa à próxima.
        </p>
      </section>

      <section aria-label="Quem se ofereceu">
        <p className="sinal mb-2">Quem se ofereceu para este horário</p>
        {oferecidos.carregando && <div className="h-12 animate-pulse rounded-lg bg-tinta-3" />}
        {!oferecidos.carregando && disponiveis.length === 0 && (
          <p className="text-xs text-gelo-3">
            Ninguém declarou disponibilidade cobrindo este plantão.
          </p>
        )}
        <ul className="space-y-1.5">
          {disponiveis.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-borda px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-gelo">{c.nome}</span>
                <span className="dado block text-[0.6875rem] text-gelo-3">
                  CRM/{c.crmUf} {c.crm}
                </span>
              </span>
              <Button
                type="button"
                variante="contorno"
                tamanho="pequeno"
                disabled={cheia || naFila(c.id)}
                onClick={() => adicionar(c)}
              >
                {naFila(c.id) ? 'Na fila' : 'Adicionar'}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <ApontarPorCrm
        aoEncontrar={adicionar}
        desabilitado={cheia}
        excluir={[...excluir, ...fila.map((c) => c.id)]}
      />
    </div>
  );
}

/**
 * DEC-091 — o colega que você conhece, por CRM + UF exato. Nunca por nome: busca
 * por nome permitiria colher a base de médicos aos poucos.
 */
function ApontarPorCrm({
  aoEncontrar,
  desabilitado,
  excluir,
}: {
  aoEncontrar: (c: CandidatoResponse) => void;
  desabilitado: boolean;
  excluir: readonly string[];
}): React.JSX.Element {
  const [crm, setCrm] = useState('');
  const [uf, setUf] = useState('PE');
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function buscar(evento?: FormEvent): Promise<void> {
    evento?.preventDefault();
    setErro(null);

    const valido = Crm.safeParse(crm);
    if (!valido.success) {
      setErro(valido.error.issues[0]?.message ?? 'CRM inválido');
      return;
    }

    setBuscando(true);
    try {
      const achado = await api.buscarPorCrm(valido.data, uf);
      if (excluir.includes(achado.id)) {
        setErro(`${achado.nome} já está na fila ou já foi convidado`);
      } else {
        aoEncontrar(achado);
        setCrm('');
      }
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível buscar');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section
      aria-label="Apontar por CRM"
      className="rounded-lg border border-dashed border-borda p-3"
    >
      <p className="sinal mb-2">Apontar um colega por CRM</p>
      <div className="grid grid-cols-[1fr_5.5rem_auto] items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="apontar-crm">CRM</Label>
          <Input
            id="apontar-crm"
            inputMode="numeric"
            value={crm}
            onChange={(e) => setCrm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void buscar();
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="apontar-uf">UF</Label>
          <select
            id="apontar-uf"
            value={uf}
            onChange={(e) => setUf(e.target.value)}
            className="flex h-12 w-full rounded-lg border border-borda bg-tinta-2 px-2 text-base text-gelo"
          >
            {UfBrasileira.options.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variante="contorno"
          className="h-12"
          disabled={desabilitado || buscando}
          onClick={() => void buscar()}
        >
          {buscando ? '…' : 'Buscar'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-gelo-3">
        Não precisa ter declarado disponibilidade — o convite é a pergunta.
      </p>
      {erro !== null && <p className="mt-2 text-xs text-vazio">{erro}</p>}
    </section>
  );
}
