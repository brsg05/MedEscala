import { ROTULO_PERFIL, type UsuarioAutenticado } from '@medescala/contracts';
import { Button } from '@/componentes/ui/button';
import { Etiqueta } from '@/componentes/ui/etiqueta';

/**
 * Única tela do app alimentada por dado real hoje: `GET /auth/me`.
 *
 * Mostra os perfis por instituição porque o ADR-006 permite que a mesma pessoa
 * seja MEDICO numa unidade e CHEFIA_ESCALA em outra — e o que ela pode fazer
 * depende de onde está. Esconder isso tornaria um 403 incompreensível.
 */
export function Conta({
  usuario,
  aoSair,
}: {
  usuario: UsuarioAutenticado;
  aoSair: () => void;
}): React.JSX.Element {
  return (
    <div className="space-y-6">
      <header>
        <p className="sinal">Sua conta</p>
        <h1
          className="mt-2 text-2xl font-extrabold tracking-tight text-gelo"
          style={{ fontFamily: 'var(--font-sinal)' }}
        >
          {usuario.nome}
        </h1>
        <p className="dado mt-1 text-sm text-gelo-2">{usuario.email}</p>
      </header>

      <section aria-label="Perfis de acesso">
        <p className="sinal mb-3">Perfis de acesso</p>

        {usuario.perfis.length === 0 ? (
          <p className="rounded-lg border border-espera/25 bg-espera-fundo px-3 py-2.5 text-sm text-espera">
            Sua conta ainda não tem perfil em nenhuma instituição. Um administrador precisa conceder
            acesso antes de você usar o sistema.
          </p>
        ) : (
          <ul className="space-y-2">
            {usuario.perfis.map((p) => (
              <li
                key={`${p.perfil}-${p.instituicaoId ?? 'plataforma'}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-borda bg-tinta-2 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gelo">
                    {ROTULO_PERFIL[p.perfil]}
                  </span>
                  <span className="block truncate text-xs text-gelo-3">
                    {p.instituicaoNome ?? 'Escopo da plataforma'}
                  </span>
                </span>

                <Etiqueta estado={p.perfil === 'CHEFIA_ESCALA' ? 'espera' : 'turno'}>
                  {p.perfil === 'CHEFIA_ESCALA' ? 'aprova' : 'ativo'}
                </Etiqueta>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Sessão" className="rounded-xl border border-borda bg-tinta-2 p-5">
        <p className="sinal">Sessão</p>
        <p className="mt-2 text-xs leading-relaxed text-gelo-3">
          Sua sessão fica num cookie que o JavaScript da página não consegue ler, e é renovada
          automaticamente. Sair encerra a sessão neste e em qualquer outro dispositivo.
        </p>
        <Button variante="contorno" className="mt-4 w-full" onClick={aoSair}>
          Sair
        </Button>
      </section>
    </div>
  );
}
