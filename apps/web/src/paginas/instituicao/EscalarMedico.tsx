import { useCallback, useState } from 'react';
import { formatarDataHora, type PlantaoResponse } from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { ErroDeFormulario, Painel } from '@/componentes/Painel';
import { Button } from '@/componentes/ui/button';

/**
 * F12 — escalar um médico na vaga.
 *
 * A lista é só de quem se ofereceu (DEC-062): verificado, da especialidade, com
 * janela cobrindo o plantão inteiro, sem conflito de agenda. Ordem alfabética,
 * de propósito — a F09 (ranking) ainda não tem fórmula, e ordenar por qualquer
 * outro critério seria inventar uma.
 */
export function EscalarMedico({
  plantao,
  aoFechar,
  aoEscalar,
}: {
  plantao: PlantaoResponse;
  aoFechar: () => void;
  aoEscalar: () => void;
}): React.JSX.Element {
  const buscar = useCallback(() => api.candidatos(plantao.id), [plantao.id]);
  const candidatos = useRecurso(buscar, [plantao.id]);
  const [escalando, setEscalando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function escalar(medicoId: string): Promise<void> {
    setEscalando(medicoId);
    setErro(null);
    try {
      await api.escalar(plantao.id, medicoId);
      aoEscalar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível escalar');
      setEscalando(null);
    }
  }

  const lista = candidatos.dado ?? [];

  return (
    <Painel titulo="Escalar médico" aoFechar={aoFechar}>
      <p className="text-sm text-gelo-2">
        {plantao.setor.nome} · <span className="dado">{formatarDataHora(plantao.inicio)}</span>
      </p>
      <p className="mt-1 text-xs text-gelo-3">Exige {plantao.especialidadeExigida}</p>

      <div className="mt-4 space-y-2">
        <ErroDeFormulario mensagem={erro ?? candidatos.erro} />

        {candidatos.carregando && (
          <div
            className="h-24 animate-pulse rounded-lg bg-tinta-3"
            aria-label="Buscando candidatos"
          />
        )}

        {!candidatos.carregando && candidatos.erro === null && lista.length === 0 && (
          <p className="rounded-lg border border-dashed border-borda px-4 py-5 text-sm leading-relaxed text-gelo-3">
            Ninguém disponível neste horário.
          </p>
        )}

        {lista.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-borda bg-tinta-3 px-3 py-2.5"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-gelo">{m.nome}</span>
              <span className="dado block text-xs text-gelo-3">
                CRM/{m.crmUf} {m.crm}
              </span>
            </span>
            <Button
              tamanho="pequeno"
              onClick={() => void escalar(m.id)}
              disabled={escalando !== null}
            >
              {escalando === m.id ? 'Escalando…' : 'Escalar'}
            </Button>
          </div>
        ))}
      </div>
    </Painel>
  );
}
