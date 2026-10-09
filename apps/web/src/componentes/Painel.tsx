import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
}

/**
 * Diálogo do app: folha que sobe do rodapé no celular, modal centralizado no
 * desktop.
 *
 * No celular a ação fica perto do polegar (RNF03). `Esc` fecha, o foco vai para o
 * primeiro campo ao abrir e volta para onde estava ao fechar — o mínimo para o
 * diálogo funcionar por teclado na estação da chefia.
 *
 * Renderiza num portal, direto no `<body>`: um ancestral com `backdrop-filter`
 * ou `transform` vira o bloco de referência do `position: fixed`, e o diálogo
 * ficava preso a ele — foi o que aconteceu com os avisos, abertos de dentro do
 * cabeçalho borrado (DEC-192).
 */
export function Painel({ titulo, aoFechar, children }: Props): React.JSX.Element {
  const idTitulo = useId();
  const caixa = useRef<HTMLDivElement>(null);

  // `aoFechar` costuma ser uma função nova a cada render do pai. Se ela fosse
  // dependência do efeito abaixo, cada tecla digitada refaria o efeito e
  // devolveria o foco ao primeiro campo no meio da digitação. A ref guarda a
  // versão mais recente sem disparar o efeito.
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;

    const primeiro = caixa.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([data-fechar])',
    );
    primeiro?.focus();

    function aoTeclar(evento: KeyboardEvent): void {
      if (evento.key === 'Escape') {
        fechar.current();
      }
    }

    document.addEventListener('keydown', aoTeclar);
    return (): void => {
      document.removeEventListener('keydown', aoTeclar);
      anterior?.focus();
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      className="fixed inset-0 z-40 flex items-end justify-center bg-tinta/80 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          aoFechar();
        }
      }}
    >
      <div
        ref={caixa}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-borda bg-tinta-2 p-5 pb-8 sm:rounded-2xl sm:pb-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={idTitulo} className="text-lg font-semibold text-gelo">
            {titulo}
          </h2>
          <button
            type="button"
            data-fechar
            onClick={aoFechar}
            aria-label="Fechar"
            className="-mt-1 -mr-1 rounded-md px-2 py-1 text-gelo-3 hover:bg-tinta-3 hover:text-gelo"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Mensagem de erro de formulário, no mesmo formato em todo o app. */
export function ErroDeFormulario({
  mensagem,
}: {
  mensagem: string | null;
}): React.JSX.Element | null {
  if (mensagem === null) {
    return null;
  }

  return (
    <p
      role="alert"
      className="rounded-lg border border-vazio/30 bg-vazio-fundo px-3 py-2.5 text-sm text-vazio"
    >
      {mensagem}
    </p>
  );
}
