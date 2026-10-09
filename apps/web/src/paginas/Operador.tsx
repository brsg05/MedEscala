import { useCallback, useState } from 'react';
import { formatarData } from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { ErroDeFormulario } from '@/componentes/Painel';
import { Button } from '@/componentes/ui/button';

function formatarCnpj(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/u, '$1.$2.$3/$4-$5');
}

/**
 * Operador da plataforma — confere o que o cadastro aberto deixa entrar.
 *
 * Duas filas, cada uma ligada a uma trava: o CRM do médico (RN02) e o CNPJ da
 * instituição (DEC-063). A conferência em si acontece fora do sistema — o CFM não
 * tem API pública, e a consulta de CNPJ ainda não foi integrada. O que o sistema
 * guarda é quem atestou e quando, na trilha de auditoria.
 */
export function Operador(): React.JSX.Element {
  const buscar = useCallback(() => api.pendencias(), []);
  const pendencias = useRecurso(buscar, []);
  const [processando, setProcessando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(id: string, acao: () => Promise<unknown>): Promise<void> {
    setProcessando(id);
    setErro(null);
    try {
      await acao();
      pendencias.recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir');
    } finally {
      setProcessando(null);
    }
  }

  const dado = pendencias.dado;
  const total = (dado?.instituicoes.length ?? 0) + (dado?.medicos.length ?? 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="sinal">Operador da plataforma</p>
        <h1
          className="mt-2 text-2xl font-extrabold tracking-tight text-gelo"
          style={{ fontFamily: 'var(--font-sinal)' }}
        >
          {dado === null
            ? 'Verificações'
            : total === 0
              ? 'Nada a conferir'
              : `${String(total)} a conferir`}
        </h1>
      </header>

      <ErroDeFormulario mensagem={erro ?? pendencias.erro} />

      {pendencias.carregando && (
        <div
          className="h-40 animate-pulse rounded-xl border border-borda bg-tinta-2"
          aria-label="Carregando"
        />
      )}

      {dado !== null && (
        <>
          <section aria-label="Instituições" className="space-y-2">
            <p className="sinal">Instituições — CNPJ</p>
            {dado.instituicoes.length === 0 && (
              <p className="text-sm text-gelo-3">Nenhuma instituição pendente.</p>
            )}
            {dado.instituicoes.map((i) => (
              <article
                key={i.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-borda bg-tinta-2 p-4"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gelo">{i.nome}</span>
                  <span className="dado block text-xs text-gelo-3">
                    {formatarCnpj(i.cnpj)} · desde {formatarData(i.criadaEm)}
                  </span>
                </span>
                <Button
                  tamanho="pequeno"
                  disabled={processando !== null}
                  onClick={() => void executar(i.id, () => api.aprovarInstituicao(i.id))}
                >
                  {processando === i.id ? 'Aprovando…' : 'Aprovar'}
                </Button>
              </article>
            ))}
          </section>

          <section aria-label="Médicos" className="space-y-2">
            <p className="sinal">Médicos — CRM</p>
            {dado.medicos.length === 0 && (
              <p className="text-sm text-gelo-3">Nenhum médico aguardando.</p>
            )}
            {dado.medicos.map((m) => (
              <article
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-borda bg-tinta-2 p-4"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gelo">{m.nome}</span>
                  <span className="dado block text-xs text-gelo-3">
                    CRM/{m.crmUf} {m.crm} · {m.especialidade}
                  </span>
                  <span className="block truncate text-xs text-gelo-3">{m.email}</span>
                </span>
                <Button
                  tamanho="pequeno"
                  disabled={processando !== null}
                  onClick={() => void executar(m.id, () => api.verificarMedico(m.id))}
                >
                  {processando === m.id ? 'Verificando…' : 'Verificar'}
                </Button>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
