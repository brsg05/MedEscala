import { useCallback } from 'react';
import { formatarData, formatarHora, type PlantaoResponse } from '@medescala/contracts';
import { api } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { ErroDeFormulario, Painel } from '@/componentes/Painel';

/** Ação gravada na trilha → frase que uma pessoa entende. */
const ACAO_LEGIVEL: Record<string, string> = {
  VAGA_PUBLICADA: 'Vaga publicada',
  MEDICO_ESCALADO: 'Médico escalado',
  REPASSE_SOLICITADO: 'Titular pediu repasse',
  PLANTAO_EM_REPASSE: 'Plantão entrou em repasse',
  REPASSE_ACEITO_PELO_SUBSTITUTO: 'Substituto aceitou',
  REPASSE_ENVIADO_PARA_APROVACAO: 'Enviado para a chefia',
  REPASSE_APROVADO: 'Chefia aprovou o repasse',
  REPASSE_RECUSADO_PELA_INSTITUICAO: 'Chefia recusou o repasse',
  EXECUTANTE_SUBSTITUIDO: 'Escala oficial atualizada',
};

/**
 * F23 — trilha de auditoria do plantão.
 *
 * O número de cada linha é a sequência gravada pelo banco, não um enfeite: o
 * critério do Sprint 3 é "a consulta devolve a sequência exata de eventos", e a
 * ordem aqui é a mesma que a do Postgres. A trilha é append-only por trigger — o
 * que está nesta lista não pode ser alterado nem apagado por ninguém.
 */
export function Trilha({
  plantao,
  aoFechar,
}: {
  plantao: PlantaoResponse;
  aoFechar: () => void;
}): React.JSX.Element {
  const buscar = useCallback(() => api.trilha(plantao.id), [plantao.id]);
  const trilha = useRecurso(buscar, [plantao.id]);

  return (
    <Painel titulo="Trilha do plantão" aoFechar={aoFechar}>
      <p className="text-sm text-gelo-2">
        {plantao.setor.nome} · <span className="dado">{formatarData(plantao.inicio)}</span>
      </p>

      <ErroDeFormulario mensagem={trilha.erro} />

      {trilha.carregando && (
        <div
          className="mt-4 h-32 animate-pulse rounded-lg bg-tinta-3"
          aria-label="Carregando trilha"
        />
      )}

      {trilha.dado !== null && (
        <ol className="mt-4 divide-y divide-borda rounded-lg border border-borda">
          {trilha.dado.map((e) => (
            <li key={e.id} className="grid grid-cols-[3rem_1fr] gap-3 px-3 py-2.5">
              <span className="dado pt-0.5 text-[0.6875rem] text-gelo-3">#{e.id}</span>
              <span className="min-w-0">
                <span className="block text-sm text-gelo">{ACAO_LEGIVEL[e.acao] ?? e.acao}</span>
                <span className="dado block text-[0.6875rem] text-gelo-3">
                  {formatarData(e.ocorridoEm)} {formatarHora(e.ocorridoEm)}
                  {e.estadoNovo !== null && e.entidade !== 'Plantao' ? ` · ${e.estadoNovo}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 text-xs leading-relaxed text-gelo-3">
        Registro imutável: o banco recusa alterar ou apagar qualquer linha desta trilha.
      </p>
    </Painel>
  );
}
