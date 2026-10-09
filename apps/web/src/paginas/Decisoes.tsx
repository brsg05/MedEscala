import { useCallback, useState } from 'react';
import {
  formatarCentavos,
  formatarDataHora,
  formatarHora,
  RecusarRepasseRequest,
  type DecisaoResponse,
} from '@medescala/contracts';
import { api, ErroDaApi, type Recorte } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { Button } from '@/componentes/ui/button';
import { Label } from '@/componentes/ui/label';
import { EstadoVazio } from '@/componentes/EstadoVazio';
import { CadeiaTriade } from '@/componentes/CadeiaTriade';
import { cadeiaDe } from '@/componentes/cadeia';

/**
 * F10 e F11 — a fila de decisões.
 *
 * Uma decisão por vez, com tudo que ela exige na mesma tela e duas saídas. O
 * diagnóstico da Entrega 1 descreve um mercado que hoje funciona por velocidade
 * de resposta em grupo de WhatsApp: se decidir aqui custar mais toques do que
 * responder no grupo, a plataforma perde para o grupo (RNF02, RNF03).
 */
export function Decisoes({ recorte }: { recorte: Recorte }): React.JSX.Element {
  // O recorte só ESTREITA o que o perfil já permite (DEC-067): no modo médico,
  // convites; no modo instituição, as aprovações daquela instituição.
  const chave = 'modo' in recorte ? 'medico' : recorte.instituicaoId;
  const buscar = useCallback(() => api.decisoesPendentes(recorte), [chave]);
  const fila = useRecurso(buscar, [chave]);

  const [indice, setIndice] = useState(0);
  const decisoes = fila.dado ?? [];
  const atual = decisoes[Math.min(indice, Math.max(decisoes.length - 1, 0))];

  function proxima(): void {
    setIndice(0);
    fila.recarregar();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="sinal">Esperando por você</p>
        <h1
          className="mt-2 text-2xl font-extrabold tracking-tight text-gelo"
          style={{ fontFamily: 'var(--font-sinal)' }}
        >
          {decisoes.length > 0 ? (
            <>
              {decisoes.length} {decisoes.length === 1 ? 'decisão' : 'decisões'}
            </>
          ) : (
            'Decisões'
          )}
        </h1>
      </header>

      {fila.erro !== null && (
        <p
          role="alert"
          className="rounded-lg border border-vazio/30 bg-vazio-fundo px-3 py-2.5 text-sm text-vazio"
        >
          {fila.erro}
        </p>
      )}

      {fila.carregando && (
        <div
          className="h-64 animate-pulse rounded-xl border border-borda bg-tinta-2"
          aria-label="Carregando decisões"
        />
      )}

      {!fila.carregando && atual !== undefined && (
        <>
          {atual.tipo === 'ACEITAR_VAGA' ? (
            <CartaoDeConviteDaVaga decisao={atual} aoResolver={proxima} />
          ) : (
            <CartaoDeDecisao decisao={atual} aoResolver={proxima} />
          )}

          {decisoes.length > 1 && (
            <div
              className="flex items-center justify-center gap-2"
              aria-label={`${String(decisoes.length)} decisões na fila`}
            >
              {decisoes.map((d, i) => (
                <span
                  key={`${d.tipo}-${d.plantao.id}`}
                  aria-hidden="true"
                  className={`h-1.5 rounded-full transition-all ${
                    i === indice ? 'w-5 bg-turno' : 'w-1.5 bg-borda'
                  }`}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!fila.carregando && fila.erro === null && decisoes.length === 0 && (
        <EstadoVazio
          titulo="Nada esperando por você"
          descricao="Nenhum convite ou aprovação pendente."
        />
      )}
    </div>
  );
}

type DecisaoDeRepasse = Exclude<DecisaoResponse, { tipo: 'ACEITAR_VAGA' }>;
type ConviteDaVaga = Extract<DecisaoResponse, { tipo: 'ACEITAR_VAGA' }>;

/**
 * F10 — convite da instituição para uma vaga aberta (DEC-135). Sem cadeia de
 * três partes: quem convidou é a própria instituição, então o aceite confirma.
 */
function CartaoDeConviteDaVaga({
  decisao,
  aoResolver,
}: {
  decisao: ConviteDaVaga;
  aoResolver: () => void;
}): React.JSX.Element {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { plantao } = decisao;

  async function executar(acao: () => Promise<unknown>): Promise<void> {
    setErro(null);
    setEnviando(true);
    try {
      await acao();
      aoResolver();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <article className="rounded-xl border border-borda bg-tinta-2 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="sinal">Convite para uma vaga</p>
        <p className="dado text-xs font-semibold text-espera">
          responda até {formatarHora(decisao.prazoConviteAte)}
        </p>
      </div>

      <h2 className="mt-2 text-lg font-semibold text-gelo">{plantao.setor.nome}</h2>
      <p className="text-sm text-gelo-3">
        {plantao.setor.unidade} · {plantao.setor.instituicao}
      </p>

      <dl className="mt-4 space-y-1.5 rounded-lg bg-tinta-3 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Início</dt>
          <dd className="dado text-right text-gelo">{formatarDataHora(plantao.inicio)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Fim</dt>
          <dd className="dado text-right text-gelo">{formatarDataHora(plantao.fim)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Valor</dt>
          <dd className="dado text-right font-semibold text-gelo">
            {formatarCentavos(plantao.valorCentavos)}
          </dd>
        </div>
      </dl>

      {erro !== null && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-vazio/30 bg-vazio-fundo px-3 py-2.5 text-sm text-vazio"
        >
          {erro}
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button
          variante="perigo"
          tamanho="grande"
          disabled={enviando}
          onClick={() => void executar(() => api.recusarConviteDaVaga(plantao.id))}
        >
          Recusar
        </Button>
        <Button
          tamanho="grande"
          disabled={enviando}
          onClick={() => void executar(() => api.aceitarConviteDaVaga(plantao.id))}
        >
          {enviando ? '…' : 'Aceitar'}
        </Button>
      </div>
    </article>
  );
}

function CartaoDeDecisao({
  decisao,
  aoResolver,
}: {
  decisao: DecisaoDeRepasse;
  aoResolver: () => void;
}): React.JSX.Element {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [justificativa, setJustificativa] = useState('');

  const ehAprovacao = decisao.tipo === 'APROVAR_SUBSTITUICAO';

  async function executar(acao: () => Promise<unknown>): Promise<void> {
    setErro(null);
    setEnviando(true);

    try {
      await acao();
      aoResolver();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir');
    } finally {
      setEnviando(false);
    }
  }

  function recusar(): void {
    // O convidado recusa sem justificativa: recusar só passa a vez ao próximo
    // da fila (DEC-089). A justificativa é exigência da F11, isto é, da chefia.
    if (!ehAprovacao) {
      void executar(() => api.recusarConvite(decisao.repasse.id));
      return;
    }

    const validado = RecusarRepasseRequest.safeParse({ justificativa });

    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'Justificativa inválida');
      return;
    }

    void executar(() => api.recusarRepasse(decisao.repasse.id, validado.data));
  }

  return (
    <article className="rounded-xl border border-borda bg-tinta-2 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="sinal">{ehAprovacao ? 'Aprovar substituição' : 'Convite para cobrir'}</p>
        {!ehAprovacao && decisao.repasse.prazoConviteAte !== null && (
          <p className="dado text-xs font-semibold text-espera">
            responda até {formatarHora(decisao.repasse.prazoConviteAte)}
          </p>
        )}
      </div>

      <h2 className="mt-2 text-lg font-semibold text-gelo">{decisao.plantao.setor.nome}</h2>
      <p className="text-sm text-gelo-3">
        {decisao.plantao.setor.unidade} · {decisao.plantao.setor.instituicao}
      </p>

      <dl className="mt-4 space-y-1.5 rounded-lg bg-tinta-3 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Início</dt>
          <dd className="dado text-right text-gelo">{formatarDataHora(decisao.plantao.inicio)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Fim</dt>
          <dd className="dado text-right text-gelo">{formatarDataHora(decisao.plantao.fim)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Valor</dt>
          <dd className="dado text-right font-semibold text-gelo">
            {formatarCentavos(decisao.plantao.valorCentavos)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-gelo-2">
        <span className="sinal block">Motivo do titular</span>
        {decisao.repasse.motivo}
      </p>

      <div className="mt-5">
        <p className="sinal mb-3">Cadeia</p>
        <CadeiaTriade elos={cadeiaDe(decisao.repasse)} />
      </div>

      {erro !== null && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-vazio/30 bg-vazio-fundo px-3 py-2.5 text-sm text-vazio"
        >
          {erro}
        </p>
      )}

      {recusando ? (
        <div className="mt-5 space-y-3">
          <Label htmlFor="justificativa">Justificativa da recusa</Label>
          <textarea
            id="justificativa"
            rows={3}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Ex.: substituto sem experiência na sala vermelha"
            className="w-full rounded-lg border border-borda bg-tinta-3 px-3 py-2.5 text-base text-gelo placeholder:text-gelo-3 focus:border-turno focus:outline-none"
          />
          {/* A F11 exige justificativa registrada — não é campo opcional. */}
          <div className="flex gap-3">
            <Button variante="contorno" className="flex-1" onClick={() => setRecusando(false)}>
              Voltar
            </Button>
            <Button variante="perigo" className="flex-1" onClick={recusar} disabled={enviando}>
              Confirmar recusa
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            variante="perigo"
            tamanho="grande"
            onClick={() => (ehAprovacao ? setRecusando(true) : recusar())}
            disabled={enviando}
          >
            Recusar
          </Button>
          <Button
            tamanho="grande"
            disabled={enviando}
            onClick={() =>
              void executar(() =>
                ehAprovacao
                  ? api.aprovarRepasse(decisao.repasse.id)
                  : api.aceitarRepasse(decisao.repasse.id),
              )
            }
          >
            {enviando ? '…' : ehAprovacao ? 'Aprovar' : 'Aceitar'}
          </Button>
        </div>
      )}
    </article>
  );
}
