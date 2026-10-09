import { useState } from 'react';
import { useNavigate } from 'react-router';
import { formatarDataHora, type NotificacaoResponse } from '@medescala/contracts';
import { api } from '@/api/cliente';
import { useNotificacoes } from '@/hooks/useNotificacoes';
import { haQuanto } from '@/lib/datas';
import { cn } from '@/lib/utils';
import { Painel } from './Painel';

/**
 * F22 — os avisos in-app (DEC-121, DEC-127).
 *
 * Mora no topo, ao lado da conta, em qualquer modo: um convite com prazo de 1h
 * (DEC-090) não pode depender de a pessoa abrir a aba certa para ser visto.
 */
export function Avisos(): React.JSX.Element {
  const { dado, recarregar } = useNotificacoes();
  const [aberto, setAberto] = useState(false);
  const navegar = useNavigate();

  const naoLidas = dado?.naoLidas ?? 0;
  const itens = dado?.itens ?? [];

  function abrir(n: NotificacaoResponse): void {
    if (!n.lida) {
      void api
        .marcarNotificacaoLida(n.id)
        .then(recarregar)
        .catch(() => undefined);
    }
    if (n.link !== null) {
      setAberto(false);
      void navegar(n.link);
    }
  }

  function marcarTodas(): void {
    void api
      .marcarTodasLidas()
      .then(recarregar)
      .catch(() => undefined);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={
          naoLidas === 0
            ? 'Avisos'
            : `Avisos, ${String(naoLidas)} ${naoLidas === 1 ? 'não lido' : 'não lidos'}`
        }
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gelo-2 transition-colors hover:bg-tinta-3 hover:text-gelo"
      >
        {/* Um bloco do trilho com o sinal aceso — o aviso é sobre a escala. */}
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
          <rect x="2.5" y="6" width="12" height="9" rx="2" opacity="0.55" />
          <rect x="5" y="9" width="7" height="1.6" rx="0.8" />
          <rect x="5" y="11.8" width="4.5" height="1.6" rx="0.8" />
          <circle cx="15.5" cy="5" r="3" />
        </svg>
        {naoLidas > 0 && (
          <span
            aria-hidden="true"
            className="dado absolute -top-0.5 -right-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-repasse px-1 text-[0.625rem] font-bold text-tinta"
          >
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <Painel titulo="Avisos" aoFechar={() => setAberto(false)}>
          {itens.length === 0 ? (
            <p className="py-6 text-center text-sm text-gelo-3">Nenhum aviso.</p>
          ) : (
            <>
              {naoLidas > 0 && (
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={marcarTodas}
                    className="text-xs font-medium text-gelo-2 underline-offset-2 hover:text-gelo hover:underline"
                  >
                    Marcar todos como lidos
                  </button>
                </div>
              )}
              <ul className="space-y-1.5">
                {itens.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => abrir(n)}
                      className={cn(
                        'flex w-full gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-tinta-3',
                        !n.lida && 'bg-tinta-3/60',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          n.lida ? 'bg-transparent' : 'bg-repasse',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn('text-sm text-gelo', !n.lida && 'font-semibold')}>
                            {n.titulo}
                          </span>
                          <span className="dado shrink-0 text-[0.6875rem] text-gelo-3">
                            {haQuanto(n.criadaEm, new Date(), formatarDataHora)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-gelo-2">
                          {n.corpo}
                        </span>
                      </span>
                      {!n.lida && <span className="sr-only">(não lido)</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Painel>
      )}
    </>
  );
}
