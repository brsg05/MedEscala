import { useCallback, useState } from 'react';
import {
  formatarCentavos,
  formatarDataHora,
  formatarHora,
  ROTULO_STATUS_CONVITE,
  ROTULO_STATUS_REPASSE,
  type CandidatoResponse,
  type RepasseComPlantao,
  type StatusRepasse,
} from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { MontadorDeFila } from '@/componentes/MontadorDeFila';
import { ErroDeFormulario, Painel } from '@/componentes/Painel';
import { Button } from '@/componentes/ui/button';
import { BotaoTermos } from '@/componentes/Termos';
import { Etiqueta } from '@/componentes/ui/etiqueta';
import { EstadoVazio } from '@/componentes/EstadoVazio';
import { AvisoDeResponsabilidade, CadeiaTriade } from '@/componentes/CadeiaTriade';
import { cadeiaDe } from '@/componentes/cadeia';

/** O estado do repasse vira cor pela mesma semântica do resto do app. */
function corDoStatus(status: StatusRepasse): 'turno' | 'vazio' | 'repasse' | 'espera' | 'neutro' {
  switch (status) {
    case 'APROVADO':
      return 'turno';
    case 'RECUSADO_INSTITUICAO':
    case 'RECUSADO_SUBSTITUTO':
      return 'vazio';
    case 'AGUARDANDO_APROVACAO':
      return 'espera';
    case 'CANCELADO':
      return 'neutro';
    default:
      return 'repasse';
  }
}

/** Um repasse ainda em curso mantém o titular responsável — e isso precisa ser dito. */
function emCurso(status: StatusRepasse): boolean {
  return (
    status === 'SOLICITADO' || status === 'SUBSTITUTO_ACEITO' || status === 'AGUARDANDO_APROVACAO'
  );
}

/**
 * F07, F11 e F13 — o núcleo do projeto.
 *
 * Cada repasse aparece com a cadeia de três partes visível, porque é ela que
 * distingue esta operação de um acordo por mensagem: sem a terceira assinatura,
 * a escala oficial não muda.
 */
export function Repasses({ usuarioId }: { usuarioId: string }): React.JSX.Element {
  // Esta tela é do modo médico: os repasses em que a pessoa é titular ou substituta.
  const buscar = useCallback(() => api.repasses({ modo: 'medico' }), []);
  const lista = useRecurso(buscar, []);

  const repasses = lista.dado ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="sinal">Substituições</p>
        <h1
          className="mt-2 text-2xl font-extrabold tracking-tight text-gelo"
          style={{ fontFamily: 'var(--font-sinal)' }}
        >
          Repasses
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gelo-2">
          Todo repasse percorre três partes. Sem as três, a escala oficial não muda.
        </p>
      </header>

      {lista.erro !== null && (
        <p
          role="alert"
          className="rounded-lg border border-vazio/30 bg-vazio-fundo px-3 py-2.5 text-sm text-vazio"
        >
          {lista.erro}
        </p>
      )}

      {lista.carregando && (
        <div
          className="h-72 animate-pulse rounded-xl border border-borda bg-tinta-2"
          aria-label="Carregando repasses"
        />
      )}

      {!lista.carregando &&
        repasses.map((item) => (
          <CartaoDeRepasse
            key={item.repasse.id}
            item={item}
            souTitular={item.repasse.titular.id === usuarioId}
            aoMudar={lista.recarregar}
          />
        ))}

      {!lista.carregando && lista.erro === null && repasses.length === 0 && (
        <EstadoVazio
          titulo="Nenhum repasse aberto"
          descricao="Quando você precisar passar um plantão, o pedido nasce na tela de Escala e vira um termo com as três assinaturas registradas e carimbo de tempo."
          funcoes="F07 pedido · F11 aprovação · F13 termo"
          sprint="Sprints 3–4"
        />
      )}
    </div>
  );
}

function CartaoDeRepasse({
  item,
  souTitular,
  aoMudar,
}: {
  item: RepasseComPlantao;
  souTitular: boolean;
  aoMudar: () => void;
}): React.JSX.Element {
  const { repasse, plantao } = item;
  const [vendoFila, setVendoFila] = useState(false);
  const [indicando, setIndicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);

  // Só o titular mexe na fila, e só enquanto ninguém aceitou (DEC-096).
  const podeMexer = souTitular && repasse.status === 'SOLICITADO';

  async function cancelar(): Promise<void> {
    setErro(null);
    setCancelando(true);
    try {
      await api.cancelarRepasse(repasse.id);
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível cancelar');
      setCancelando(false);
    }
  }

  return (
    <article className="rounded-xl border border-borda bg-tinta-2 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gelo">{plantao.setor.nome}</h2>
          <p className="truncate text-xs text-gelo-3">
            {plantao.setor.unidade} · {plantao.setor.instituicao}
          </p>
        </div>
        <Etiqueta estado={corDoStatus(repasse.status)}>
          {ROTULO_STATUS_REPASSE[repasse.status]}
        </Etiqueta>
      </div>

      <dl className="mt-4 space-y-1.5 rounded-lg bg-tinta-3 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Plantão</dt>
          <dd className="dado text-right text-gelo">{formatarDataHora(plantao.inicio)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Valor</dt>
          <dd className="dado text-right text-gelo">{formatarCentavos(plantao.valorCentavos)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Modelo fiscal</dt>
          <dd className="text-right text-gelo">
            {repasse.modeloFiscal === 'A_RECONTRATACAO'
              ? 'A — recontratação'
              : 'B — subcontratação'}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-gelo-2">
        <span className="sinal block">Motivo</span>
        {repasse.motivo}
      </p>

      <div className="mt-5">
        <p className="sinal mb-3">Cadeia de assinatura</p>
        <CadeiaTriade elos={cadeiaDe(repasse)} />
      </div>

      {emCurso(repasse.status) && (
        <div className="mt-4">
          <AvisoDeResponsabilidade />
        </div>
      )}

      {podeMexer && repasse.filaEsgotada && (
        <p className="mt-4 rounded-lg border border-vazio/30 bg-vazio-fundo px-3 py-2.5 text-sm leading-relaxed text-vazio">
          Ninguém aceitou. Indique outras pessoas ou cancele o pedido — enquanto isso, o plantão
          continua seu.
        </p>
      )}

      <div className="mt-4">
        <ErroDeFormulario mensagem={erro} />
      </div>

      {souTitular && (
        <div className="flex flex-wrap gap-2">
          <Button variante="contorno" tamanho="pequeno" onClick={() => setVendoFila(true)}>
            Ver fila de convites
          </Button>
          {podeMexer && (
            <Button variante="contorno" tamanho="pequeno" onClick={() => setIndicando(true)}>
              Indicar mais pessoas
            </Button>
          )}
          {podeMexer && (
            <Button
              variante="perigo"
              tamanho="pequeno"
              disabled={cancelando}
              onClick={() => void cancelar()}
            >
              {cancelando ? 'Cancelando…' : 'Cancelar repasse'}
            </Button>
          )}
        </div>
      )}

      {repasse.status === 'APROVADO' && (
        <div className="mt-4 flex">
          <BotaoTermos plantaoId={plantao.id} />
        </div>
      )}

      {vendoFila && <FilaDeConvites repasseId={repasse.id} aoFechar={() => setVendoFila(false)} />}

      {indicando && (
        <IndicarMais
          repasseId={repasse.id}
          plantaoId={plantao.id}
          aoFechar={() => setIndicando(false)}
          aoIndicar={() => {
            setIndicando(false);
            aoMudar();
          }}
        />
      )}
    </article>
  );
}

/** A fila como ela realmente andou: quem foi chamado, em que ordem, e o que respondeu. */
function FilaDeConvites({
  repasseId,
  aoFechar,
}: {
  repasseId: string;
  aoFechar: () => void;
}): React.JSX.Element {
  const buscar = useCallback(() => api.filaDoRepasse(repasseId), [repasseId]);
  const fila = useRecurso(buscar, [repasseId]);
  const convites = fila.dado ?? [];

  return (
    <Painel titulo="Fila de convites" aoFechar={aoFechar}>
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

/** DEC-096: a fila voltou ao titular, ou ele quer reforçá-la antes disso. */
function IndicarMais({
  repasseId,
  plantaoId,
  aoFechar,
  aoIndicar,
}: {
  repasseId: string;
  plantaoId: string;
  aoFechar: () => void;
  aoIndicar: () => void;
}): React.JSX.Element {
  const buscar = useCallback(() => api.filaDoRepasse(repasseId), [repasseId]);
  const jaConvidados = useRecurso(buscar, [repasseId]);
  const [fila, setFila] = useState<CandidatoResponse[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(): Promise<void> {
    setErro(null);
    setEnviando(true);
    try {
      await api.indicar(repasseId, { indicados: fila.map((c) => c.id) });
      aoIndicar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível indicar');
      setEnviando(false);
    }
  }

  return (
    <Painel titulo="Indicar mais pessoas" aoFechar={aoFechar}>
      {jaConvidados.carregando ? (
        <div className="h-24 animate-pulse rounded-lg bg-tinta-3" />
      ) : (
        <MontadorDeFila
          plantaoId={plantaoId}
          fila={fila}
          aoMudar={setFila}
          excluir={(jaConvidados.dado ?? []).map((c) => c.medico.id)}
        />
      )}

      <div className="mt-5">
        <ErroDeFormulario mensagem={erro} />
      </div>

      <div className="mt-4 flex gap-3">
        <Button type="button" variante="contorno" className="flex-1" onClick={aoFechar}>
          Voltar
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={enviando || fila.length === 0}
          onClick={() => void enviar()}
        >
          {enviando ? 'Enviando…' : 'Convidar'}
        </Button>
      </div>
    </Painel>
  );
}
