import { useState } from 'react';
import {
  ANTECEDENCIA_DO_CHECKIN_MS,
  ContestarPlantaoRequest,
  formatarDataHora,
  formatarHora,
  ResolverContestacaoRequest,
  ResponderContestacaoRequest,
  ROTULO_RESULTADO_CONTESTACAO,
  type PlantaoResponse,
  type ResultadoContestacao,
} from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { ErroDeFormulario } from './Painel';
import { Button } from './ui/button';
import { Label } from './ui/label';

interface Props {
  plantao: PlantaoResponse;
  /** Quem olha: o executante, ou a chefia da instituição (DEC-130). */
  perspectiva: 'medico' | 'instituicao';
  aoMudar: () => void;
}

const CAMPO_DE_TEXTO =
  'w-full rounded-lg border border-borda bg-tinta-3 px-3 py-2.5 text-base text-gelo placeholder:text-gelo-3 focus:border-turno focus:outline-none';

/**
 * F16 — a execução do plantão, dentro do cartão dele (DEC-130 a DEC-134).
 *
 * Um componente para as duas perspectivas porque o estado é um só: o médico vê
 * o que pode fazer (check-in, check-out, responder) e a chefia o que pode
 * decidir (confirmar, contestar, resolver). Cada um enxerga o que o outro fez.
 */
export function ExecucaoDoPlantao({
  plantao,
  perspectiva,
  aoMudar,
}: Props): React.JSX.Element | null {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const agora = Date.now();
  const inicio = Date.parse(plantao.inicio);
  const fim = Date.parse(plantao.fim);
  const { execucao, status } = plantao;
  const contestacao = execucao.contestacao;

  async function executar(acao: () => Promise<unknown>): Promise<void> {
    setErro(null);
    setEnviando(true);
    try {
      await acao();
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir');
    } finally {
      setEnviando(false);
    }
  }

  const contestavel =
    execucao.semConfirmacao ||
    (status === 'EXECUTADO' &&
      execucao.contestavelAte !== null &&
      Date.parse(execucao.contestavelAte) > agora);

  let situacao: React.ReactNode = null;
  let acoes: React.ReactNode = null;

  if (execucao.semConfirmacao) {
    situacao =
      perspectiva === 'medico' ? (
        <p className="text-xs text-espera">
          Terminou sem {status === 'CONFIRMADO' ? 'check-in' : 'check-out'}. A instituição vai
          confirmar ou contestar.
        </p>
      ) : (
        <p className="text-xs text-espera">
          <strong className="font-semibold">Sem confirmação:</strong> terminou sem{' '}
          {status === 'CONFIRMADO' ? 'check-in' : 'check-out'} do executante.
        </p>
      );

    if (perspectiva === 'instituicao') {
      acoes = (
        <Button
          tamanho="pequeno"
          className="flex-1"
          disabled={enviando}
          onClick={() => void executar(() => api.confirmarExecucao(plantao.id))}
        >
          Confirmar cumprido
        </Button>
      );
    }
  } else if (status === 'CONFIRMADO' && perspectiva === 'medico') {
    const abre = inicio - ANTECEDENCIA_DO_CHECKIN_MS;
    if (agora >= abre && agora < fim) {
      acoes = (
        <Button
          tamanho="pequeno"
          className="flex-1"
          disabled={enviando}
          onClick={() => void executar(() => api.checkin(plantao.id))}
        >
          {enviando ? '…' : 'Fazer check-in'}
        </Button>
      );
    } else if (agora < abre && abre - agora < 24 * 3_600_000) {
      situacao = (
        <p className="text-xs text-gelo-3">Check-in a partir das {formatarHora(new Date(abre))}.</p>
      );
    }
  } else if (status === 'EM_EXECUCAO') {
    situacao = (
      <p className="text-xs text-turno">
        Em execução desde{' '}
        <span className="dado">{formatarHora(execucao.checkinEm ?? plantao.inicio)}</span>
      </p>
    );
    if (perspectiva === 'medico' && agora >= inicio) {
      acoes = (
        <Button
          tamanho="pequeno"
          className="flex-1"
          disabled={enviando}
          onClick={() => void executar(() => api.checkout(plantao.id))}
        >
          {enviando ? '…' : 'Fazer check-out'}
        </Button>
      );
    }
  } else if (status === 'EXECUTADO') {
    situacao = (
      <p className="text-xs text-turno">
        Cumprido
        {execucao.checkinEm !== null && execucao.checkoutEm !== null && (
          <span className="dado">
            {' '}
            · {formatarHora(execucao.checkinEm)}–{formatarHora(execucao.checkoutEm)}
          </span>
        )}
        {contestavel && execucao.contestavelAte !== null && (
          <span className="text-gelo-3">
            {' '}
            · contestável até{' '}
            <span className="dado">{formatarDataHora(execucao.contestavelAte)}</span>
          </span>
        )}
        {contestacao?.resultado != null && (
          <span className="text-gelo-3">
            {' '}
            · {ROTULO_RESULTADO_CONTESTACAO[contestacao.resultado].toLowerCase()} após contestação
          </span>
        )}
      </p>
    );
  }

  const podeContestar = perspectiva === 'instituicao' && contestavel;
  const mostraContestacao = status === 'CONTESTADO' && contestacao !== null;

  if (situacao === null && acoes === null && !podeContestar && !mostraContestacao) {
    return null;
  }

  return (
    <div className="mt-3 space-y-3 border-t border-borda pt-3">
      {situacao}

      {mostraContestacao && (
        <Contestacao
          plantaoId={plantao.id}
          contestacao={contestacao}
          perspectiva={perspectiva}
          aoMudar={aoMudar}
        />
      )}

      {(acoes !== null || podeContestar) && (
        <div className="flex gap-2">
          {acoes}
          {podeContestar && <Contestar plantaoId={plantao.id} aoMudar={aoMudar} />}
        </div>
      )}

      <ErroDeFormulario mensagem={erro} />
    </div>
  );
}

/** A chefia contesta, com justificativa obrigatória (DEC-134). */
function Contestar({
  plantaoId,
  aoMudar,
}: {
  plantaoId: string;
  aoMudar: () => void;
}): React.JSX.Element {
  const [aberto, setAberto] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!aberto) {
    return (
      <Button
        variante="contorno"
        tamanho="pequeno"
        className="flex-1"
        onClick={() => setAberto(true)}
      >
        Contestar
      </Button>
    );
  }

  async function enviar(): Promise<void> {
    setErro(null);
    const validado = ContestarPlantaoRequest.safeParse({ justificativa });
    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'Justificativa inválida');
      return;
    }
    setEnviando(true);
    try {
      await api.contestar(plantaoId, validado.data);
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível contestar');
      setEnviando(false);
    }
  }

  return (
    <div className="w-full space-y-2">
      <Label htmlFor={`contestar-${plantaoId}`}>O que não confere</Label>
      <textarea
        id={`contestar-${plantaoId}`}
        rows={3}
        value={justificativa}
        onChange={(e) => setJustificativa(e.target.value)}
        placeholder="Ex.: saída registrada na portaria às 15h, antes do fim do plantão"
        className={CAMPO_DE_TEXTO}
      />
      <ErroDeFormulario mensagem={erro} />
      <div className="flex gap-2">
        <Button
          variante="contorno"
          tamanho="pequeno"
          className="flex-1"
          onClick={() => setAberto(false)}
        >
          Voltar
        </Button>
        <Button
          variante="perigo"
          tamanho="pequeno"
          className="flex-1"
          disabled={enviando}
          onClick={() => void enviar()}
        >
          Confirmar contestação
        </Button>
      </div>
    </div>
  );
}

/** CONTESTADO: a justificativa, a versão do médico e a decisão (DEC-134). */
function Contestacao({
  plantaoId,
  contestacao,
  perspectiva,
  aoMudar,
}: {
  plantaoId: string;
  contestacao: NonNullable<PlantaoResponse['execucao']['contestacao']>;
  perspectiva: 'medico' | 'instituicao';
  aoMudar: () => void;
}): React.JSX.Element {
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<ResultadoContestacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(acao: () => Promise<unknown>): Promise<void> {
    setEnviando(true);
    try {
      await acao();
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir');
      setEnviando(false);
    }
  }

  function responder(): void {
    setErro(null);
    const validado = ResponderContestacaoRequest.safeParse({ resposta: texto });
    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'Resposta inválida');
      return;
    }
    void enviar(() => api.responderContestacao(plantaoId, validado.data));
  }

  function resolver(): void {
    setErro(null);
    const validado = ResolverContestacaoRequest.safeParse({ resultado, nota: texto });
    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'Decisão inválida');
      return;
    }
    void enviar(() => api.resolverContestacao(plantaoId, validado.data));
  }

  return (
    <div className="space-y-3 rounded-lg border border-espera/30 bg-espera-fundo p-3">
      <div>
        <p className="sinal text-espera">Contestado pela instituição</p>
        <p className="mt-1 text-sm text-gelo">{contestacao.justificativa}</p>
      </div>

      {contestacao.resposta !== null && (
        <div>
          <p className="sinal">
            {perspectiva === 'medico' ? 'Sua resposta' : 'Resposta do médico'}
          </p>
          <p className="mt-1 text-sm text-gelo-2">{contestacao.resposta}</p>
        </div>
      )}

      {perspectiva === 'medico' && contestacao.resposta === null && (
        <div className="space-y-2">
          <Label htmlFor={`resposta-${plantaoId}`}>Sua versão</Label>
          <textarea
            id={`resposta-${plantaoId}`}
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className={CAMPO_DE_TEXTO}
          />
          <Button tamanho="pequeno" className="w-full" disabled={enviando} onClick={responder}>
            Enviar resposta
          </Button>
        </div>
      )}

      {perspectiva === 'medico' && contestacao.resposta !== null && (
        <p className="text-xs text-gelo-3">Aguardando a decisão da instituição.</p>
      )}

      {perspectiva === 'instituicao' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Decisão">
            {(['IMPROCEDENTE', 'PROCEDENTE'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={resultado === r}
                onClick={() => setResultado(r)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  resultado === r
                    ? 'border-turno bg-tinta-3 text-gelo'
                    : 'border-borda text-gelo-2 hover:bg-tinta-3'
                }`}
              >
                {r === 'IMPROCEDENTE' ? 'Manter como cumprido' : 'Cancelar o plantão'}
              </button>
            ))}
          </div>
          {resultado !== null && (
            <>
              <Label htmlFor={`nota-${plantaoId}`}>Motivo da decisão</Label>
              <textarea
                id={`nota-${plantaoId}`}
                rows={2}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className={CAMPO_DE_TEXTO}
              />
              <Button
                tamanho="pequeno"
                variante={resultado === 'PROCEDENTE' ? 'perigo' : 'primario'}
                className="w-full"
                disabled={enviando}
                onClick={resolver}
              >
                Registrar decisão
              </Button>
            </>
          )}
        </div>
      )}

      <ErroDeFormulario mensagem={erro} />
    </div>
  );
}
