import { useEffect, useState, type ReactNode } from 'react';
import type { PoliticaResponse } from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { MarcaDoApp } from '@/componentes/AppShell';
import { ErroDeFormulario } from '@/componentes/Painel';
import { PoliticaDePrivacidade } from '@/componentes/PoliticaDePrivacidade';
import { Button } from '@/componentes/ui/button';

type Estado =
  | { fase: 'verificando' }
  | { fase: 'em-dia' }
  | { fase: 'pendente'; politica: PoliticaResponse; versaoAceita: string | null };

/**
 * F24 — barreira da área logada (DEC-225).
 *
 * Quem ainda não aceitou a versão vigente da política vê a política e decide:
 * aceita, ou sai. A api recusa o resto com 428 de qualquer jeito; esta tela só
 * evita que a pessoa descubra isso por uma tela quebrada.
 */
export function AceiteDaPolitica({
  aoSair,
  children,
}: {
  aoSair: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const [estado, setEstado] = useState<Estado>({ fase: 'verificando' });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void (async (): Promise<void> => {
      try {
        const situacao = await api.situacaoDoAceite();
        if (!situacao.pendente) {
          if (ativo) setEstado({ fase: 'em-dia' });
          return;
        }
        const politica = await api.politica();
        if (ativo) {
          setEstado({ fase: 'pendente', politica, versaoAceita: situacao.versaoAceita });
        }
      } catch {
        // Sem resposta, não prende a pessoa aqui: as telas mostram o erro da api.
        if (ativo) setEstado({ fase: 'em-dia' });
      }
    })();
    return (): void => {
      ativo = false;
    };
  }, []);

  if (estado.fase === 'em-dia') {
    return <>{children}</>;
  }

  if (estado.fase === 'verificando') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <MarcaDoApp />
        <span className="sr-only">Verificando política de privacidade</span>
      </div>
    );
  }

  const { politica, versaoAceita } = estado;

  async function aceitar(): Promise<void> {
    setErro(null);
    setEnviando(true);
    try {
      await api.aceitarPolitica(politica.versao);
      setEstado({ fase: 'em-dia' });
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível registrar o aceite.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col px-5 py-10">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <header>
          <MarcaDoApp />
          <h1
            className="mt-6 text-2xl font-extrabold tracking-tight text-gelo"
            style={{ fontFamily: 'var(--font-sinal)' }}
          >
            {versaoAceita === null ? 'Política de privacidade' : 'A política de privacidade mudou'}
          </h1>
        </header>

        <PoliticaDePrivacidade politica={politica} />

        <ErroDeFormulario mensagem={erro} />

        <div className="space-y-2">
          <Button
            tamanho="grande"
            className="w-full"
            disabled={enviando}
            onClick={() => void aceitar()}
          >
            {enviando ? 'Registrando…' : 'Li e aceito'}
          </Button>
          <Button variante="discreto" className="w-full" onClick={aoSair}>
            Sair
          </Button>
        </div>
      </div>
    </main>
  );
}
