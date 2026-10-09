import { useCallback, useEffect, useState } from 'react';
import { ErroDaApi } from '@/api/cliente';

export interface Recurso<T> {
  dado: T | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
}

/**
 * Carrega um recurso da api com os três estados que a tela precisa distinguir:
 * carregando, erro e vazio.
 *
 * Existe para que nenhuma tela confunda "ainda não chegou" com "não há nada" —
 * são mensagens diferentes para o usuário, e tratar as duas como a mesma coisa
 * é o erro mais comum de tela que busca dado.
 */
export function useRecurso<T>(
  buscar: () => Promise<T>,
  dependencias: readonly unknown[] = [],
): Recurso<T> {
  const [dado, setDado] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gatilho, setGatilho] = useState(0);

  // As dependências vêm do chamador de propósito: `buscar` é recriada a cada
  // render, e usá-la direto como dependência recarregaria a tela em laço.
  const buscarEstavel = useCallback(buscar, dependencias);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);

    buscarEstavel()
      .then((resultado) => {
        if (ativo) {
          setDado(resultado);
        }
      })
      .catch((e: unknown) => {
        if (ativo) {
          setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar');
        }
      })
      .finally(() => {
        if (ativo) {
          setCarregando(false);
        }
      });

    return (): void => {
      ativo = false;
    };
  }, [buscarEstavel, gatilho]);

  return {
    dado,
    carregando,
    erro,
    recarregar: (): void => {
      setGatilho((n) => n + 1);
    },
  };
}
