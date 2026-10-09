import { useState, type FormEvent } from 'react';
import { LoginRequest, type UsuarioAutenticado } from '@medescala/contracts';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { MarcaDoApp } from '@/componentes/AppShell';
import { api, ErroDaApi } from '@/api/cliente';

/**
 * A tese do produto, no lugar onde normalmente vai uma frase de marketing.
 *
 * A Entrega 1 é clara sobre o diferencial: não é mais um quadro de vagas, é a
 * formalização do repasse. Então a entrada do app mostra a cadeia de três partes
 * em miniatura — é o que o produto faz, dito com a linguagem do próprio sistema.
 */
function TeseDoProduto(): React.JSX.Element {
  const partes = [
    { rotulo: 'titular', cor: 'bg-turno' },
    { rotulo: 'substituto', cor: 'bg-repasse' },
    { rotulo: 'instituição', cor: 'bg-espera' },
  ] as const;

  return (
    <div className="rounded-xl border border-borda bg-tinta-2 px-4 py-4">
      <ol className="flex items-center gap-2">
        {partes.map((parte, i) => (
          <li key={parte.rotulo} className="flex flex-1 items-center gap-2">
            <span className="min-w-0 flex-1">
              <span aria-hidden="true" className={`block h-1 rounded-full ${parte.cor}`} />
              <span className="sinal mt-1.5 block truncate !text-gelo-2">{parte.rotulo}</span>
            </span>
            {i < partes.length - 1 && (
              <span aria-hidden="true" className="shrink-0 pb-4 text-gelo-3">
                →
              </span>
            )}
          </li>
        ))}
      </ol>

      <p className="mt-3 text-xs leading-relaxed text-gelo-2">
        Um plantão só muda de mãos quando as três partes registram o ato. Até lá, quem estava
        escalado continua responsável.
      </p>
    </div>
  );
}

export function Login({
  aoEntrar,
  aoCriarConta,
}: {
  aoEntrar: (usuario: UsuarioAutenticado) => void;
  aoCriarConta: () => void;
}): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);
    setErrosDeCampo({});

    // Validação no cliente com o MESMO schema Zod que a api usa no servidor
    // (ADR-005). Não existe uma segunda definição de "login válido".
    const validado = LoginRequest.safeParse({ email, senha });

    if (!validado.success) {
      setErrosDeCampo(
        Object.fromEntries(validado.error.issues.map((i) => [String(i.path[0] ?? ''), i.message])),
      );
      return;
    }

    setEnviando(true);

    try {
      const sessao = await api.login(validado.data);
      aoEntrar(sessao.usuario);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <header>
          <MarcaDoApp />
          <h1
            className="mt-6 text-3xl leading-[1.1] font-extrabold tracking-tight text-gelo"
            style={{ fontFamily: 'var(--font-sinal)' }}
          >
            O plantão que você
            <br />
            passa adiante
            <br />
            <span className="text-turno">continua registrado.</span>
          </h1>
        </header>

        <TeseDoProduto />

        <form onSubmit={(e) => void enviar(e)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={errosDeCampo['email'] !== undefined}
              aria-describedby={errosDeCampo['email'] !== undefined ? 'erro-email' : undefined}
            />
            {errosDeCampo['email'] !== undefined && (
              <p id="erro-email" className="text-xs text-vazio">
                {errosDeCampo['email']}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              aria-invalid={errosDeCampo['senha'] !== undefined}
              aria-describedby={errosDeCampo['senha'] !== undefined ? 'erro-senha' : undefined}
            />
            {errosDeCampo['senha'] !== undefined && (
              <p id="erro-senha" className="text-xs text-vazio">
                {errosDeCampo['senha']}
              </p>
            )}
          </div>

          {erro !== null && (
            <p
              role="alert"
              className="rounded-lg border border-vazio/30 bg-vazio-fundo px-3 py-2.5 text-sm text-vazio"
            >
              {erro}
            </p>
          )}

          <Button type="submit" tamanho="grande" className="w-full" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>

          <Button type="button" variante="discreto" className="w-full" onClick={aoCriarConta}>
            Criar conta
          </Button>
        </form>
      </div>
    </main>
  );
}
