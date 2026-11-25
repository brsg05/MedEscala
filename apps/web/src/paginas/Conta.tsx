import { useState } from 'react';
import {
  ROTULO_PERFIL,
  type PoliticaResponse,
  type UsuarioAutenticado,
} from '@medescala/contracts';
import { api } from '@/api/cliente';
import { Painel } from '@/componentes/Painel';
import { PoliticaDePrivacidade } from '@/componentes/PoliticaDePrivacidade';
import { Button } from '@/componentes/ui/button';
import { useRecurso } from '@/hooks/useRecurso';
import { Etiqueta } from '@/componentes/ui/etiqueta';

export function Conta({
  usuario,
  aoSair,
  aoFechar,
}: {
  usuario: UsuarioAutenticado;
  aoSair: () => void;
  aoFechar: () => void;
}): React.JSX.Element {
  const [politica, setPolitica] = useState<PoliticaResponse | null>(null);

  return (
    <Painel
      titulo={politica === null ? 'Sua conta' : 'Política de privacidade'}
      aoFechar={aoFechar}
    >
      {politica !== null ? (
        <div className="space-y-4">
          <PoliticaDePrivacidade politica={politica} />
          <Button variante="contorno" className="w-full" onClick={() => setPolitica(null)}>
            Voltar para a conta
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <header>
            <h3
              className="text-2xl font-extrabold tracking-tight text-gelo"
              style={{ fontFamily: 'var(--font-sinal)' }}
            >
              {usuario.nome}
            </h3>
            <p className="dado mt-1 text-sm text-gelo-2">{usuario.email}</p>
          </header>

          <section aria-label="Perfis de acesso">
            <p className="sinal mb-3">Perfis de acesso</p>

            {usuario.perfis.length === 0 ? (
              <p className="rounded-lg border border-espera/25 bg-espera-fundo px-3 py-2.5 text-sm text-espera">
                Sua conta ainda não tem perfil em nenhuma instituição. Um administrador precisa
                conceder acesso antes de você usar o sistema.
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

          <Privacidade aoLer={setPolitica} />

          <section aria-label="Sessão" className="rounded-xl border border-borda bg-tinta-2 p-5">
            <p className="sinal">Sessão</p>
            <Button variante="contorno" className="mt-4 w-full" onClick={aoSair}>
              Sair
            </Button>
          </section>
        </div>
      )}
    </Painel>
  );
}

/** F24 — qual versão da política a pessoa aceitou, e quando; e o texto dela. */
function Privacidade({
  aoLer,
}: {
  aoLer: (politica: PoliticaResponse) => void;
}): React.JSX.Element {
  const aceite = useRecurso(() => api.situacaoDoAceite());
  const politica = useRecurso(() => api.politica());

  return (
    <section aria-label="Privacidade" className="rounded-xl border border-borda bg-tinta-2 p-5">
      <p className="sinal">Privacidade</p>
      <p className="mt-2 text-sm text-gelo-2">
        {aceite.carregando
          ? 'Carregando…'
          : aceite.dado?.aceitoEm != null
            ? `Você aceitou a política ${aceite.dado.versaoAceita ?? ''} em ${new Date(
                aceite.dado.aceitoEm,
              ).toLocaleString('pt-BR')}.`
            : 'Não foi possível consultar seu aceite agora.'}
      </p>
      <Button
        variante="contorno"
        className="mt-4 w-full"
        disabled={politica.dado === null}
        onClick={() => {
          if (politica.dado !== null) aoLer(politica.dado);
        }}
      >
        Ver política de privacidade
      </Button>
    </section>
  );
}
