import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router';
import type { UsuarioAutenticado } from '@medescala/contracts';
import { api } from '@/api/cliente';
import { AppShell, MarcaDoApp } from '@/componentes/AppShell';
import { modosDisponiveis, rotaInicial, type Modo } from '@/modo';
import { Cadastro } from '@/paginas/Cadastro';
import { Conta } from '@/paginas/Conta';
import { Decisoes } from '@/paginas/Decisoes';
import { Disponibilidade } from '@/paginas/Disponibilidade';
import { Escala } from '@/paginas/Escala';
import { EscalaInstituicao } from '@/paginas/instituicao/EscalaInstituicao';
import { Estrutura } from '@/paginas/instituicao/Estrutura';
import { Login } from '@/paginas/Login';
import { Operador } from '@/paginas/Operador';
import { Repasses } from '@/paginas/Repasses';

type Sessao =
  | { estado: 'carregando' }
  | { estado: 'fora'; tela: 'entrar' | 'cadastrar' }
  | { estado: 'dentro'; usuario: UsuarioAutenticado };

export function App(): React.JSX.Element {
  const [sessao, setSessao] = useState<Sessao>({ estado: 'carregando' });

  // Reidrata a sessão no boot. O cookie httpOnly sobrevive ao refresh da página,
  // mas o JS não consegue lê-lo — quem responde "ainda estou logado?" é a api.
  useEffect(() => {
    api
      .me()
      .then((usuario) => {
        setSessao({ estado: 'dentro', usuario });
      })
      .catch(() => {
        setSessao({ estado: 'fora', tela: 'entrar' });
      });
  }, []);

  if (sessao.estado === 'carregando') {
    return <Abertura />;
  }

  const entrar = (usuario: UsuarioAutenticado): void => {
    setSessao({ estado: 'dentro', usuario });
  };

  if (sessao.estado === 'fora') {
    return sessao.tela === 'entrar' ? (
      <Login
        aoEntrar={entrar}
        aoCriarConta={() => setSessao({ estado: 'fora', tela: 'cadastrar' })}
      />
    ) : (
      <Cadastro aoEntrar={entrar} aoVoltar={() => setSessao({ estado: 'fora', tela: 'entrar' })} />
    );
  }

  return (
    <AreaLogada
      usuario={sessao.usuario}
      aoSair={() => {
        void api.logout().finally(() => {
          setSessao({ estado: 'fora', tela: 'entrar' });
        });
      }}
    />
  );
}

/**
 * Rotas por modo (DEC-061, DEC-078). Cada rota só existe para quem tem o modo
 * correspondente; quem tenta abrir uma rota que não é sua cai na rota inicial.
 */
function AreaLogada({
  usuario,
  aoSair,
}: {
  usuario: UsuarioAutenticado;
  aoSair: () => void;
}): React.JSX.Element {
  const modos = useMemo(() => modosDisponiveis(usuario), [usuario]);
  const inicio = useMemo(() => rotaInicial(modos), [modos]);

  const so = (tipo: Modo['tipo'], pagina: ReactNode): ReactNode =>
    modos.some((m) => m.tipo === tipo) ? pagina : <Navigate to={inicio} replace />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell usuario={usuario} />}>
          {/* modo médico */}
          <Route path="/escala" element={so('medico', <Escala />)} />
          <Route path="/disponibilidade" element={so('medico', <Disponibilidade />)} />
          <Route
            path="/decisoes"
            element={so('medico', <Decisoes recorte={{ modo: 'medico' }} />)}
          />
          <Route path="/repasses" element={so('medico', <Repasses usuarioId={usuario.id} />)} />

          {/* modo instituição */}
          <Route
            path="/instituicao/:instituicaoId/escala"
            element={
              <DaInstituicao modos={modos} inicio={inicio}>
                <EscalaInstituicao />
              </DaInstituicao>
            }
          />
          <Route
            path="/instituicao/:instituicaoId/decisoes"
            element={
              <DaInstituicao modos={modos} inicio={inicio}>
                <DecisoesDaInstituicao />
              </DaInstituicao>
            }
          />
          <Route
            path="/instituicao/:instituicaoId/estrutura"
            element={
              <DaInstituicao modos={modos} inicio={inicio}>
                <Estrutura usuario={usuario} />
              </DaInstituicao>
            }
          />

          {/* modo operador */}
          <Route path="/operador" element={so('operador', <Operador />)} />

          <Route path="/conta" element={<Conta usuario={usuario} aoSair={aoSair} />} />
          <Route path="*" element={<Navigate to={inicio} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

/** Só renderiza se o usuário tem papel naquela instituição. */
function DaInstituicao({
  modos,
  inicio,
  children,
}: {
  modos: readonly Modo[];
  inicio: string;
  children: ReactNode;
}): React.JSX.Element {
  const { instituicaoId } = useParams();
  const pertence = modos.some((m) => m.tipo === 'instituicao' && m.instituicaoId === instituicaoId);
  return pertence ? <>{children}</> : <Navigate to={inicio} replace />;
}

function DecisoesDaInstituicao(): React.JSX.Element {
  const { instituicaoId = '' } = useParams();
  return <Decisoes key={instituicaoId} recorte={{ instituicaoId }} />;
}

/**
 * Tela de abertura enquanto a sessão é verificada.
 *
 * Mostra a marca em vez de um spinner: a verificação leva um piscar de olhos, e
 * um spinner que aparece e some nesse tempo só produz tremor na tela.
 */
function Abertura(): React.JSX.Element {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <MarcaDoApp />
      <span className="sr-only">Verificando sessão</span>
    </div>
  );
}
