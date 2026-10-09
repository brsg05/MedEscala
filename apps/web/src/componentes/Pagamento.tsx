import { useCallback, useState } from 'react';
import {
  formatarAliquota,
  formatarCentavos,
  formatarDataHora,
  ROTULO_STATUS_PAGAMENTO,
  ROTULO_TRIBUTO,
  type FinanceiroResponse,
} from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { cn } from '@/lib/utils';
import { ErroDeFormulario, Painel } from './Painel';
import { Button } from './ui/button';
import { Etiqueta } from './ui/etiqueta';

type Perna = FinanceiroResponse['pernas'][number];

/**
 * F14, F15, F17 — o dinheiro de um plantão: a reserva (garantia), o que é retido
 * na fonte, a NFS-e e a liberação (DEC-201, DEC-202). Tudo simulado (DEC-122):
 * o painel diz isso, para ninguém tomar por cobrança real.
 */
export function BotaoPagamento({ plantaoId }: { plantaoId: string }): React.JSX.Element {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button
        variante="contorno"
        tamanho="pequeno"
        className="flex-1"
        onClick={() => setAberto(true)}
      >
        Pagamento
      </Button>
      {aberto && <PagamentoDoPlantao plantaoId={plantaoId} aoFechar={() => setAberto(false)} />}
    </>
  );
}

function corDoStatus(status: Perna['status']): 'turno' | 'espera' | 'repasse' | 'vazio' | 'neutro' {
  switch (status) {
    case 'LIBERADO':
      return 'turno';
    case 'RETIDO':
      return 'espera';
    case 'PRE_AUTORIZADO':
      return 'repasse';
    case 'ESTORNADO':
      return 'vazio';
    default:
      return 'neutro';
  }
}

function PagamentoDoPlantao({
  plantaoId,
  aoFechar,
}: {
  plantaoId: string;
  aoFechar: () => void;
}): React.JSX.Element {
  const buscar = useCallback(() => api.financeiro(plantaoId), [plantaoId]);
  const financeiro = useRecurso(buscar, [plantaoId]);
  const pernas = financeiro.dado?.pernas ?? [];

  return (
    <Painel titulo="Pagamento" aoFechar={aoFechar}>
      {financeiro.carregando && <div className="h-24 animate-pulse rounded-lg bg-tinta-3" />}
      <ErroDeFormulario mensagem={financeiro.erro} />
      {!financeiro.carregando && financeiro.erro === null && pernas.length === 0 && (
        <p className="text-sm text-gelo-3">Ainda não há pagamento para este plantão.</p>
      )}
      <ul className="space-y-3">
        {pernas.map((p) => (
          <CartaoDaPerna key={p.id} perna={p} aoMudar={financeiro.recarregar} />
        ))}
      </ul>
    </Painel>
  );
}

function CartaoDaPerna({
  perna: p,
  aoMudar,
}: {
  perna: Perna;
  aoMudar: () => void;
}): React.JSX.Element {
  const [erro, setErro] = useState<string | null>(null);
  const [emitindo, setEmitindo] = useState(false);
  const doc = p.documentoFiscal;

  async function emitir(): Promise<void> {
    if (doc === null) return;
    setErro(null);
    setEmitindo(true);
    try {
      await api.emitirNfse(doc.id);
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível emitir a nota');
    } finally {
      setEmitindo(false);
    }
  }

  return (
    <li className="rounded-lg border border-borda bg-tinta-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gelo">
            {p.perna === 'SUBCONTRATACAO' ? 'Subcontratação (modelo B)' : 'Pagamento do plantão'}
          </p>
          <p className="truncate text-xs text-gelo-3">
            {p.pagador} paga a {p.beneficiario}
          </p>
        </div>
        <Etiqueta estado={corDoStatus(p.status)}>{ROTULO_STATUS_PAGAMENTO[p.status]}</Etiqueta>
      </div>

      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Valor do plantão</dt>
          <dd className="dado text-gelo">{formatarCentavos(p.valorBrutoCentavos)}</dd>
        </div>
        {(doc?.retencoes ?? []).map((l) => (
          <div key={l.tributo} className="flex justify-between gap-3">
            <dt className={cn(l.retido ? 'text-gelo-3' : 'text-gelo-3/60 line-through')}>
              {ROTULO_TRIBUTO[l.tributo]} {formatarAliquota(l.aliquotaBp)}
              {!l.retido && l.motivo !== null && (
                <span className="block no-underline">{l.motivo}</span>
              )}
            </dt>
            <dd className={cn('dado', l.retido ? 'text-gelo-2' : 'text-gelo-3/60')}>
              − {formatarCentavos(l.valorCentavos)}
            </dd>
          </div>
        ))}
        {doc === null && p.retidoCentavos > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-gelo-3">Retenções na fonte (estimativa)</dt>
            <dd className="dado text-gelo-2">− {formatarCentavos(p.retidoCentavos)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3 border-t border-borda pt-1">
          <dt className="font-medium text-gelo-2">Líquido para o médico</dt>
          <dd className="dado font-semibold text-gelo">{formatarCentavos(p.liquidoCentavos)}</dd>
        </div>
      </dl>

      {p.status === 'RETIDO' && p.liberavelEm !== null && (
        <p className="mt-2 text-xs text-espera">
          Liberação a partir de <span className="dado">{formatarDataHora(p.liberavelEm)}</span>, com
          a nota emitida.
        </p>
      )}

      {doc !== null && (
        <div className="mt-3 rounded-md border border-borda px-2.5 py-2 text-xs">
          <p className="font-medium text-gelo-2">
            NFS-e{' '}
            {doc.status === 'EMITIDA'
              ? `nº ${doc.numero ?? ''}`
              : doc.status === 'CANCELADA'
                ? 'cancelada'
                : '(rascunho)'}
          </p>
          <p className="mt-0.5 text-gelo-3">
            {doc.prestadorNome} ({doc.prestadorRegistro}) → {doc.tomadorNome}
          </p>
          {doc.status === 'EMITIDA' && doc.emitidaEm !== null && (
            <p className="mt-0.5 text-gelo-3">
              Emitida em <span className="dado">{formatarDataHora(doc.emitidaEm)}</span>
              {doc.emitidaPor === 'AUTOMATICA' ? ' pela plataforma, no fim do prazo' : ''} · código{' '}
              <span className="dado">{doc.codigoVerificacao}</span>
            </p>
          )}
          {doc.observacoes.map((o) => (
            <p key={o} className="mt-1 text-gelo-3">
              {o}
            </p>
          ))}
          {doc.podeEmitir && (
            <Button
              tamanho="pequeno"
              className="mt-2 w-full"
              disabled={emitindo}
              onClick={() => void emitir()}
            >
              {emitindo ? 'Emitindo…' : 'Emitir NFS-e'}
            </Button>
          )}
        </div>
      )}
      {erro !== null && <p className="mt-2 text-xs text-vazio">{erro}</p>}
    </li>
  );
}
