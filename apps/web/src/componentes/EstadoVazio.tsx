import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  /** O que vai aparecer aqui quando houver dado. Descritivo, não promocional. */
  descricao: string;
  ilustracao?: ReactNode;
}

/**
 * Estado vazio: diz o que falta, sem explicar a regra por trás nem citar
 * requisito — isso é documentação, não interface.
 */
export function EstadoVazio({ titulo, descricao, ilustracao }: Props): React.JSX.Element {
  return (
    <div className="rounded-xl border border-dashed border-borda bg-tinta-2/50 px-5 py-8 text-center">
      {ilustracao !== undefined && <div className="mb-5">{ilustracao}</div>}

      <h2 className="text-base font-semibold text-gelo">{titulo}</h2>

      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gelo-2">{descricao}</p>
    </div>
  );
}
