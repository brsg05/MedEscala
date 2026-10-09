import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { UsuarioAutenticado } from '@medescala/contracts';
import { cn } from '@/lib/utils';
import { lembrarModo, modoDaRota, modosDisponiveis, type Modo } from '@/modo';

/**
 * Glifos desenhados à mão em vez de biblioteca de ícones.
 *
 * Cada um cita um elemento do próprio sistema: a régua de cobertura, a fila de
 * decisões, a cadeia tríade, a janela de disponibilidade. Um conjunto genérico
 * diria "agenda, sino, engrenagem" e não teria relação com o que o app faz.
 */
const GLIFOS = {
  escala: (
    <>
      <rect x="2" y="5" width="9" height="4" rx="1.2" />
      <rect x="7" y="11" width="11" height="4" rx="1.2" opacity="0.5" />
    </>
  ),
  disponibilidade: (
    <>
      <path d="M3 4v12M17 4v12" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <rect x="5.5" y="8" width="9" height="4" rx="1.2" opacity="0.6" />
    </>
  ),
  decisoes: (
    <>
      <rect x="3" y="3" width="14" height="6" rx="1.5" />
      <rect x="5" y="11" width="10" height="3" rx="1.5" opacity="0.55" />
      <rect x="7" y="15.5" width="6" height="2.5" rx="1.25" opacity="0.3" />
    </>
  ),
  repasses: (
    <>
      <circle cx="10" cy="3.6" r="2.1" />
      <circle cx="10" cy="10" r="2.1" opacity="0.6" />
      <circle cx="10" cy="16.4" r="2.1" opacity="0.3" />
      <path d="M10 5.7v2.2M10 12.1v2.2" strokeWidth="1.3" stroke="currentColor" fill="none" />
    </>
  ),
  estrutura: (
    <>
      <rect x="7.5" y="2.5" width="5" height="4" rx="1" />
      <path
        d="M10 6.5v3M4.5 9.5h11M4.5 9.5v3M15.5 9.5v3"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
      />
      <rect x="2" y="12.5" width="5" height="4" rx="1" opacity="0.55" />
      <rect x="13" y="12.5" width="5" height="4" rx="1" opacity="0.55" />
    </>
  ),
  verificacao: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2.5" opacity="0.3" />
      <path d="M6.5 10.3l2.4 2.4 4.6-5.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </>
  ),
  conta: (
    <>
      <circle cx="10" cy="6.5" r="3.2" />
      <path d="M3.8 17c0-3.4 2.8-5.6 6.2-5.6s6.2 2.2 6.2 5.6" opacity="0.6" />
    </>
  ),
} as const;

type NomeGlifo = keyof typeof GLIFOS;

interface ItemNav {
  para: string;
  rotulo: string;
  glifo: NomeGlifo;
}

/** A navegação é do modo ativo: cada contexto vê só o que lhe cabe (DEC-061). */
function navegacaoDo(modo: Modo | null): ItemNav[] {
  const conta: ItemNav = { para: '/conta', rotulo: 'Conta', glifo: 'conta' };

  if (modo === null) {
    return [conta];
  }

  switch (modo.tipo) {
    case 'medico':
      return [
        { para: '/escala', rotulo: 'Escala', glifo: 'escala' },
        { para: '/disponibilidade', rotulo: 'Disponível', glifo: 'disponibilidade' },
        { para: '/decisoes', rotulo: 'Decisões', glifo: 'decisoes' },
        { para: '/repasses', rotulo: 'Repasses', glifo: 'repasses' },
        conta,
      ];
    case 'instituicao': {
      const base = `/instituicao/${modo.instituicaoId}`;
      return [
        { para: `${base}/escala`, rotulo: 'Escala', glifo: 'escala' },
        { para: `${base}/decisoes`, rotulo: 'Decisões', glifo: 'decisoes' },
        { para: `${base}/estrutura`, rotulo: 'Estrutura', glifo: 'estrutura' },
        conta,
      ];
    }
    case 'operador':
      return [{ para: '/operador', rotulo: 'Verificações', glifo: 'verificacao' }, conta];
  }
}

function Glifo({ nome, className }: { nome: NomeGlifo; className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      {GLIFOS[nome]}
    </svg>
  );
}

export function AppShell({ usuario }: { usuario: UsuarioAutenticado }): React.JSX.Element {
  const { pathname } = useLocation();
  const modos = useMemo(() => modosDisponiveis(usuario), [usuario]);
  const ativo = modoDaRota(modos, pathname);
  const navegacao = navegacaoDo(ativo);

  useEffect(() => {
    if (ativo !== null) {
      lembrarModo(ativo);
    }
  }, [ativo]);

  const iniciais = usuario.nome
    .split(' ')
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

  return (
    <div className="min-h-dvh md:flex">
      {/* Navegação lateral no desktop: a estação da chefia é um computador. */}
      <nav
        aria-label="Seções"
        className="hidden w-60 shrink-0 border-r border-borda bg-tinta-2 p-4 md:flex md:flex-col"
      >
        <MarcaDoApp className="mb-6 px-2" />
        <SeletorDeModo modos={modos} ativo={ativo} className="mb-6" />
        <ul className="space-y-1">
          {navegacao.map((item) => (
            <li key={item.para}>
              <NavLink
                to={item.para}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-tinta-3 text-gelo' : 'text-gelo-2 hover:bg-tinta-3/60',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Glifo nome={item.glifo} className={cn('h-5 w-5', isActive && 'text-turno')} />
                    {item.rotulo}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-borda bg-tinta/95 px-4 backdrop-blur md:h-16 md:px-6">
          <MarcaDoApp className="shrink-0 md:hidden" />
          <SeletorDeModo modos={modos} ativo={ativo} className="min-w-0 md:hidden" compacto />
          <div className="hidden md:block" />

          <NavLink
            to="/conta"
            className="dado flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tinta-3 text-xs font-semibold text-gelo-2 transition-colors hover:bg-borda"
            aria-label={`Conta de ${usuario.nome}`}
          >
            {iniciais}
          </NavLink>
        </header>

        {/* `pb-24` abre espaço para a barra inferior não cobrir o último elemento. */}
        <main className="flex-1 px-4 pt-5 pb-24 md:px-6 md:pt-6 md:pb-8">
          <div className="mx-auto w-full max-w-2xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Barra inferior no celular: alcance do polegar às 3h da manhã (RNF03). */}
      <nav
        aria-label="Seções"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-borda bg-tinta-2/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {navegacao.map((item) => (
          <NavLink
            key={item.para}
            to={item.para}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.6875rem] font-medium transition-colors',
                isActive ? 'text-turno' : 'text-gelo-3',
              )
            }
          >
            <Glifo nome={item.glifo} className="h-5 w-5" />
            {item.rotulo}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/**
 * "Como quem" a pessoa está usando o app (DEC-061).
 *
 * Com um modo só, mostra o contexto sem menu — a chefia ainda precisa ver de qual
 * instituição está cuidando. Com mais de um, vira um menu que apenas navega.
 */
function SeletorDeModo({
  modos,
  ativo,
  className,
  compacto = false,
}: {
  modos: readonly Modo[];
  ativo: Modo | null;
  className?: string;
  compacto?: boolean;
}): React.JSX.Element | null {
  const [aberto, setAberto] = useState(false);
  const navegar = useNavigate();
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) {
      return undefined;
    }

    function fecharSeFora(evento: MouseEvent): void {
      if (raiz.current !== null && !raiz.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    function fecharComEsc(evento: KeyboardEvent): void {
      if (evento.key === 'Escape') {
        setAberto(false);
      }
    }

    document.addEventListener('mousedown', fecharSeFora);
    document.addEventListener('keydown', fecharComEsc);
    return (): void => {
      document.removeEventListener('mousedown', fecharSeFora);
      document.removeEventListener('keydown', fecharComEsc);
    };
  }, [aberto]);

  if (modos.length === 0) {
    return null;
  }

  const rotulo = ativo?.rotulo ?? 'Escolher contexto';
  const papel = ativo === null ? null : papelDo(ativo);

  if (modos.length === 1) {
    return (
      <div className={cn('min-w-0', className)}>
        {!compacto && <p className="sinal mb-1 px-2">Usando como</p>}
        <p className="truncate px-2 text-sm font-medium text-gelo">{rotulo}</p>
      </div>
    );
  }

  return (
    <div ref={raiz} className={cn('relative min-w-0', className)}>
      {!compacto && <p className="sinal mb-1 px-2">Usando como</p>}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-borda bg-tinta-3 px-3 py-2 text-left text-sm text-gelo transition-colors hover:bg-borda"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{rotulo}</span>
          {papel !== null && !compacto && (
            <span className="block text-xs text-gelo-3">{papel}</span>
          )}
        </span>
        <span aria-hidden="true" className="text-gelo-3">
          ▾
        </span>
      </button>

      {aberto && (
        <ul
          role="menu"
          className="absolute top-full right-0 left-0 z-40 mt-1 min-w-56 overflow-hidden rounded-lg border border-borda bg-tinta-2 py-1 shadow-xl"
        >
          {modos.map((m) => (
            <li key={m.inicio} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAberto(false);
                  void navegar(m.inicio);
                }}
                className={cn(
                  'flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-tinta-3',
                  ativo?.inicio === m.inicio && 'bg-tinta-3',
                )}
              >
                <span className="text-sm font-medium text-gelo">{m.rotulo}</span>
                <span className="text-xs text-gelo-3">{papelDo(m)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function papelDo(modo: Modo): string {
  switch (modo.tipo) {
    case 'medico':
      return 'Seus plantões e repasses';
    case 'operador':
      return 'Verifica CRM e CNPJ';
    case 'instituicao':
      return modo.admin && modo.chefia
        ? 'Administração e chefia de escala'
        : modo.admin
          ? 'Administração'
          : 'Chefia de escala';
  }
}

export function MarcaDoApp({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      {/* A marca é o próprio trilho: três blocos, um deles descoberto. */}
      <span aria-hidden="true" className="flex h-4 items-end gap-[3px]">
        <span className="h-2.5 w-1.5 rounded-[2px] bg-turno" />
        <span className="h-4 w-1.5 rounded-[2px] bg-repasse" />
        <span className="h-3 w-1.5 rounded-[2px] bg-vazio" />
      </span>
      <span
        className="text-[0.9375rem] font-extrabold tracking-tight text-gelo"
        style={{ fontFamily: 'var(--font-sinal)' }}
      >
        MedEscala
      </span>
    </span>
  );
}
