import { useCallback, useState } from 'react';
import {
  formatarCentavos,
  formatarDataHora,
  formatarHora,
  ROTULO_STATUS_CANDIDATURA,
  type VagaResponse,
} from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { ErroDeFormulario } from '@/componentes/Painel';
import { Button } from '@/componentes/ui/button';
import { Etiqueta } from '@/componentes/ui/etiqueta';
import { cn } from '@/lib/utils';

/**
 * F10 — vagas abertas, dentro da aba Disponível (DEC-168).
 *
 * Por padrão só as compatíveis; o médico pode ver todas (DEC-166). Nas que não
 * servem, o motivo aparece no lugar do botão — ver não é poder se candidatar
 * (DEC-167, RN02 e RN03).
 */
export function VagasAbertas(): React.JSX.Element {
  const [todas, setTodas] = useState(false);
  const buscar = useCallback(() => api.vagas(todas), [todas]);
  const vagas = useRecurso(buscar, [todas]);
  const lista = vagas.dado ?? [];

  return (
    <section aria-label="Vagas abertas" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="sinal">Vagas abertas</p>
        <div role="radiogroup" aria-label="Quais vagas mostrar" className="flex gap-1 text-xs">
          {[
            { valor: false, rotulo: 'Compatíveis' },
            { valor: true, rotulo: 'Todas' },
          ].map((o) => (
            <button
              key={o.rotulo}
              type="button"
              role="radio"
              aria-checked={todas === o.valor}
              onClick={() => setTodas(o.valor)}
              className={cn(
                'rounded-full px-3 py-1 font-medium transition-colors',
                todas === o.valor ? 'bg-tinta-3 text-gelo' : 'text-gelo-3 hover:text-gelo-2',
              )}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      </div>

      <ErroDeFormulario mensagem={vagas.erro} />

      {vagas.carregando && (
        <div
          className="h-20 animate-pulse rounded-xl border border-borda bg-tinta-2"
          aria-label="Carregando vagas"
        />
      )}

      {!vagas.carregando && vagas.erro === null && lista.length === 0 && (
        <p className="rounded-xl border border-dashed border-borda px-4 py-6 text-center text-sm text-gelo-3">
          {todas ? 'Nenhuma vaga aberta no momento.' : 'Nenhuma vaga compatível agora.'}
        </p>
      )}

      {lista.map((v) => (
        <CartaoDeVaga key={v.plantao.id} vaga={v} aoMudar={vagas.recarregar} />
      ))}
    </section>
  );
}

function CartaoDeVaga({
  vaga,
  aoMudar,
}: {
  vaga: VagaResponse;
  aoMudar: () => void;
}): React.JSX.Element {
  const { plantao, minhaCandidatura } = vaga;
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function executar(acao: () => Promise<unknown>): Promise<void> {
    setErro(null);
    setEnviando(true);
    try {
      await acao();
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir');
    } finally {
      setEnviando(false);
    }
  }

  const pendente = minhaCandidatura?.status === 'PENDENTE';
  // Retirada pode voltar; recusada não (a resposta da chefia está dada).
  const podeCandidatar =
    vaga.compativel && (minhaCandidatura === null || minhaCandidatura.status === 'RETIRADA');

  return (
    <article
      className={cn(
        'rounded-xl border bg-tinta-2 p-4',
        vaga.compativel ? 'border-borda' : 'border-borda/60 opacity-75',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gelo">{plantao.setor.nome}</p>
          <p className="truncate text-xs text-gelo-3">
            {plantao.setor.unidade} · {plantao.setor.instituicao}
          </p>
        </div>
        <p className="dado shrink-0 text-sm font-semibold text-gelo">
          {formatarCentavos(plantao.valorCentavos)}
        </p>
      </div>

      <p className="dado mt-2 text-xs text-gelo-2">
        {formatarDataHora(plantao.inicio)} – {formatarHora(plantao.fim)} ·{' '}
        {plantao.especialidadeExigida}
      </p>

      <div className="mt-3 flex items-center justify-between gap-3">
        {!vaga.compativel ? (
          <p className="text-xs text-gelo-3">{vaga.motivo}</p>
        ) : minhaCandidatura !== null && minhaCandidatura.status !== 'RETIRADA' ? (
          <Etiqueta estado={pendente ? 'espera' : 'neutro'}>
            {ROTULO_STATUS_CANDIDATURA[minhaCandidatura.status]}
          </Etiqueta>
        ) : (
          <span />
        )}

        {podeCandidatar && (
          <Button
            tamanho="pequeno"
            disabled={enviando}
            onClick={() => void executar(() => api.candidatar(plantao.id))}
          >
            {enviando ? '…' : 'Candidatar-me'}
          </Button>
        )}
        {pendente && (
          <Button
            variante="discreto"
            tamanho="pequeno"
            disabled={enviando}
            onClick={() => void executar(() => api.retirarCandidatura(minhaCandidatura.id))}
          >
            Retirar
          </Button>
        )}
      </div>

      {erro !== null && <p className="mt-2 text-xs text-vazio">{erro}</p>}
    </article>
  );
}
