import { useCallback, useEffect, useState } from 'react';
import { INTERVALO_DE_NOTIFICACOES_MS, type NotificacoesResponse } from '@medescala/contracts';
import { api } from '@/api/cliente';

export interface Notificacoes {
  dado: NotificacoesResponse | null;
  recarregar: () => void;
}

/**
 * F22 — polling dos avisos (DEC-127).
 *
 * Consulta a cada ~20s e ao voltar para a aba; com a aba escondida, não
 * consulta — ninguém está olhando, e o próximo foco traz tudo de uma vez. Falha
 * de rede é silenciosa: o sino mantém o último estado em vez de piscar erro a
 * cada 20 segundos.
 */
export function useNotificacoes(): Notificacoes {
  const [dado, setDado] = useState<NotificacoesResponse | null>(null);

  const recarregar = useCallback((): void => {
    api
      .notificacoes()
      .then(setDado)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    recarregar();

    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        recarregar();
      }
    }, INTERVALO_DE_NOTIFICACOES_MS);

    function aoVoltar(): void {
      if (document.visibilityState === 'visible') {
        recarregar();
      }
    }

    document.addEventListener('visibilitychange', aoVoltar);
    return (): void => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [recarregar]);

  return { dado, recarregar };
}
