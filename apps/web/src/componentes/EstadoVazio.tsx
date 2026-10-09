import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  /** O que vai aparecer aqui quando houver dado. Descritivo, não promocional. */
  descricao: string;
  /** Funções da Entrega 1 que alimentam esta tela — ex.: 'F07 · F11'. */
  funcoes: string;
  sprint: string;
  ilustracao?: ReactNode;
}

/**
 * Estado vazio honesto.
 *
 * O Sprint 0 entregou só autenticação: as 25 rotas de domínio do §9 do guia ainda
 * não existem. Preencher estas telas com plantões fictícios faria a demo parecer
 * melhor e mentiria sobre o que o sistema faz — inclusive para a banca.
 *
 * Então cada tela diz o que vai aparecer, qual função da Entrega 1 a alimenta e em
 * que sprint ela chega. Para a equipe, isso é o mapa do que falta ligar; para quem
 * avalia, é a diferença entre escopo declarado e escopo entregue.
 */
export function EstadoVazio({
  titulo,
  descricao,
  funcoes,
  sprint,
  ilustracao,
}: Props): React.JSX.Element {
  return (
    <div className="rounded-xl border border-dashed border-borda bg-tinta-2/50 px-5 py-8 text-center">
      {ilustracao !== undefined && <div className="mb-5">{ilustracao}</div>}

      <h2 className="text-base font-semibold text-gelo">{titulo}</h2>

      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gelo-2">{descricao}</p>

      <p className="dado mt-5 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-md bg-tinta-3 px-2.5 py-1.5 text-[0.6875rem] text-gelo-3">
        <span className="text-gelo-2">{funcoes}</span>
        <span aria-hidden="true">·</span>
        <span>{sprint}</span>
      </p>
    </div>
  );
}
