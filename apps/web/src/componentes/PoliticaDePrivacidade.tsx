import type { PoliticaResponse } from '@medescala/contracts';

/**
 * F24 — a política como o titular lê: uma categoria de dado por bloco, com
 * finalidade, base legal e por quanto tempo fica guardada.
 */
export function PoliticaDePrivacidade({
  politica,
}: {
  politica: PoliticaResponse;
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gelo-2">{politica.resumo}</p>

      <ul className="space-y-2">
        {politica.itens.map((item) => (
          <li key={item.categoria} className="rounded-lg border border-borda bg-tinta-2 px-4 py-3">
            <p className="text-sm font-medium text-gelo">{item.categoria}</p>
            <p className="mt-0.5 text-xs text-gelo-3">{item.dados}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-gelo-3">Para quê</dt>
              <dd className="text-gelo-2">{item.finalidade}</dd>
              <dt className="text-gelo-3">Base legal</dt>
              <dd className="text-gelo-2">{item.baseLegal}</dd>
              <dt className="text-gelo-3">Guardado</dt>
              <dd className="text-gelo-2">{item.retencao}</dd>
            </dl>
          </li>
        ))}
      </ul>

      <ul className="list-disc space-y-1 pl-5 text-sm text-gelo-2">
        {politica.compromissos.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>

      <p className="dado text-xs text-gelo-3">
        Versão {politica.versao} · vigente desde{' '}
        {new Date(`${politica.vigenteDesde}T12:00:00Z`).toLocaleDateString('pt-BR')}
      </p>
    </div>
  );
}
