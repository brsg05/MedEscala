import { useCallback, useState } from 'react';
import {
  formatarDataHora,
  formatarHora,
  ROTULO_STATUS_CANDIDATURA,
  ROTULO_STATUS_CONVITE,
  type CandidatoResponse,
  type PlantaoResponse,
} from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { MontadorDeFila } from '@/componentes/MontadorDeFila';
import { ErroDeFormulario, Painel } from '@/componentes/Painel';
import { Button } from '@/componentes/ui/button';

/**
 * F10 — o que a chefia faz com uma vaga aberta além de escalar direto: convidar
 * pela fila (DEC-135, DEC-164) e escolher entre quem se candidatou.
 */

/** Convidar pela fila: até 5 indicados, ou ninguém — aí o matching chama. */
export function ConvidarParaVaga({
  plantao,
  aoFechar,
  aoConvidar,
}: {
  plantao: PlantaoResponse;
  aoFechar: () => void;
  aoConvidar: () => void;
}): React.JSX.Element {
  const buscarFila = useCallback(() => api.filaDaVaga(plantao.id), [plantao.id]);
  const jaConvidados = useRecurso(buscarFila, [plantao.id]);
  const [fila, setFila] = useState<CandidatoResponse[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(): Promise<void> {
    setErro(null);
    setEnviando(true);
    try {
      await api.convidarParaVaga(plantao.id, { indicados: fila.map((c) => c.id) });
      aoConvidar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível convidar');
      setEnviando(false);
    }
  }

  return (
    <Painel titulo="Convidar para a vaga" aoFechar={aoFechar}>
      <p className="mb-4 text-sm text-gelo-2">
        {plantao.setor.nome} · <span className="dado">{formatarDataHora(plantao.inicio)}</span>
      </p>

      {jaConvidados.carregando ? (
        <div className="h-24 animate-pulse rounded-lg bg-tinta-3" />
      ) : (
        <MontadorDeFila
          plantaoId={plantao.id}
          fila={fila}
          aoMudar={setFila}
          excluir={(jaConvidados.dado ?? []).map((c) => c.medico.id)}
          buscarOferecidos={api.candidatos}
          semIndicacao="Ninguém indicado. Sem indicação, o sistema convida, 5 por vez, quem se ofereceu para este horário. Quem aceitar primeiro na sua vez fica com a vaga."
        />
      )}

      <div className="mt-5">
        <ErroDeFormulario mensagem={erro} />
      </div>

      <div className="mt-4 flex gap-3">
        <Button type="button" variante="contorno" className="flex-1" onClick={aoFechar}>
          Voltar
        </Button>
        <Button type="button" className="flex-1" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? 'Convidando…' : fila.length > 0 ? 'Convidar' : 'Convidar pelo matching'}
        </Button>
      </div>
    </Painel>
  );
}

/** Quem se candidatou; a chefia escolhe um, e ele é escalado (DEC-135). */
export function CandidaturasDaVaga({
  plantao,
  aoFechar,
  aoEscolher,
}: {
  plantao: PlantaoResponse;
  aoFechar: () => void;
  aoEscolher: () => void;
}): React.JSX.Element {
  const buscar = useCallback(() => api.candidaturas(plantao.id), [plantao.id]);
  const lista = useRecurso(buscar, [plantao.id]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  async function executar(id: string, acao: () => Promise<unknown>, fecha: boolean): Promise<void> {
    setErro(null);
    setEnviando(id);
    try {
      await acao();
      if (fecha) aoEscolher();
      else lista.recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir');
    } finally {
      setEnviando(null);
    }
  }

  const candidaturas = lista.dado ?? [];

  return (
    <Painel titulo="Candidaturas" aoFechar={aoFechar}>
      <p className="mb-4 text-sm text-gelo-2">
        {plantao.setor.nome} · <span className="dado">{formatarDataHora(plantao.inicio)}</span>
      </p>

      {lista.carregando && <div className="h-24 animate-pulse rounded-lg bg-tinta-3" />}
      <ErroDeFormulario mensagem={lista.erro ?? erro} />

      {!lista.carregando && candidaturas.length === 0 && (
        <p className="text-sm text-gelo-3">Ninguém se candidatou ainda.</p>
      )}

      <ul className="space-y-2">
        {candidaturas.map((c) => (
          <li key={c.id} className="rounded-lg border border-borda px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm text-gelo">{c.medico.nome}</span>
                <span className="dado block text-[0.6875rem] text-gelo-3">
                  CRM/{c.medico.crmUf} {c.medico.crm} · {c.medico.especialidade}
                </span>
              </span>
              {c.status !== 'PENDENTE' && (
                <span className="shrink-0 text-xs text-gelo-3">
                  {ROTULO_STATUS_CANDIDATURA[c.status]}
                </span>
              )}
            </div>
            {c.status === 'PENDENTE' && (
              <div className="mt-2 flex gap-2">
                <Button
                  variante="contorno"
                  tamanho="pequeno"
                  className="flex-1"
                  disabled={enviando !== null}
                  onClick={() => void executar(c.id, () => api.recusarCandidatura(c.id), false)}
                >
                  Recusar
                </Button>
                <Button
                  tamanho="pequeno"
                  className="flex-1"
                  disabled={enviando !== null}
                  onClick={() => void executar(c.id, () => api.aceitarCandidatura(c.id), true)}
                >
                  {enviando === c.id ? '…' : 'Escolher'}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Painel>
  );
}

/** A fila da vaga como ela andou — quem foi chamado, em que ordem, e o que respondeu. */
export function FilaDaVaga({
  plantao,
  aoFechar,
}: {
  plantao: PlantaoResponse;
  aoFechar: () => void;
}): React.JSX.Element {
  const buscar = useCallback(() => api.filaDaVaga(plantao.id), [plantao.id]);
  const fila = useRecurso(buscar, [plantao.id]);
  const convites = fila.dado ?? [];

  return (
    <Painel titulo="Fila de convites da vaga" aoFechar={aoFechar}>
      {fila.carregando && <div className="h-24 animate-pulse rounded-lg bg-tinta-3" />}
      <ErroDeFormulario mensagem={fila.erro} />
      {!fila.carregando && fila.erro === null && convites.length === 0 && (
        <p className="text-sm text-gelo-3">Ninguém foi convidado ainda.</p>
      )}
      <ol className="space-y-1.5">
        {convites.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-lg bg-tinta-3 px-3 py-2">
            <span className="dado w-5 shrink-0 text-sm font-semibold text-repasse">{c.ordem}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-gelo">{c.medico.nome}</span>
              <span className="dado block text-[0.6875rem] text-gelo-3">
                CRM/{c.medico.crmUf} {c.medico.crm} ·{' '}
                {c.origem === 'MATCHING' ? 'matching' : 'indicação'}
              </span>
            </span>
            <span className="text-right text-xs text-gelo-2">
              {ROTULO_STATUS_CONVITE[c.status]}
              {c.status === 'ATIVO' && c.prazoAte !== null && (
                <span className="dado block text-espera">até {formatarHora(c.prazoAte)}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </Painel>
  );
}
