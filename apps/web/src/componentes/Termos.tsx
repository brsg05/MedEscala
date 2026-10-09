import { useCallback, useState } from 'react';
import {
  formatarDataHora,
  ROTULO_PAPEL_NO_TERMO,
  ROTULO_TIPO_TERMO,
  type TermoResponse,
} from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { cn } from '@/lib/utils';
import { ErroDeFormulario, Painel } from './Painel';
import { Button } from './ui/button';

/**
 * F13 — os termos de um plantão (DEC-184 a DEC-187): quem assinou, com que
 * ação, o que falta, e o PDF.
 */
export function BotaoTermos({ plantaoId }: { plantaoId: string }): React.JSX.Element {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button
        variante="contorno"
        tamanho="pequeno"
        className="flex-1"
        onClick={() => setAberto(true)}
      >
        Termos
      </Button>
      {aberto && <TermosDoPlantao plantaoId={plantaoId} aoFechar={() => setAberto(false)} />}
    </>
  );
}

function TermosDoPlantao({
  plantaoId,
  aoFechar,
}: {
  plantaoId: string;
  aoFechar: () => void;
}): React.JSX.Element {
  const buscar = useCallback(() => api.termos(plantaoId), [plantaoId]);
  const termos = useRecurso(buscar, [plantaoId]);
  const lista = termos.dado ?? [];

  return (
    <Painel titulo="Termos" aoFechar={aoFechar}>
      {termos.carregando && <div className="h-24 animate-pulse rounded-lg bg-tinta-3" />}
      <ErroDeFormulario mensagem={termos.erro} />
      {!termos.carregando && termos.erro === null && lista.length === 0 && (
        <p className="text-sm text-gelo-3">Nenhum termo ainda.</p>
      )}
      <ul className="space-y-3">
        {lista.map((t) => (
          <CartaoDoTermo key={t.id} termo={t} />
        ))}
      </ul>
    </Painel>
  );
}

function CartaoDoTermo({ termo }: { termo: TermoResponse }): React.JSX.Element {
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  async function baixar(): Promise<void> {
    setErro(null);
    setBaixando(true);
    try {
      const { arquivo, nome } = await api.pdfDoTermo(termo.id);
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível baixar o PDF');
    } finally {
      setBaixando(false);
    }
  }

  return (
    <li
      className={cn(
        'rounded-lg border p-3',
        termo.vigente ? 'border-borda bg-tinta-3' : 'border-borda/60 opacity-70',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-gelo">{ROTULO_TIPO_TERMO[termo.tipo]}</p>
        <p className="dado shrink-0 text-[0.6875rem] text-gelo-3">
          {termo.vigente ? formatarDataHora(termo.emitidoEm) : 'substituído'}
        </p>
      </div>

      <ul className="mt-2 space-y-1">
        {termo.assinaturas.map((a) => (
          <li key={a.papel} className="text-xs text-gelo-2">
            <span className="text-turno">✓</span> {ROTULO_PAPEL_NO_TERMO[a.papel]}: {a.nome}
            <span className="block pl-4 text-gelo-3">
              {a.acao} · <span className="dado">{formatarDataHora(a.assinadaEm)}</span>
            </span>
          </li>
        ))}
        {termo.pendentes.map((p) => (
          <li key={p} className="text-xs text-espera">
            ○ {ROTULO_PAPEL_NO_TERMO[p]}: aguardando aceite
          </li>
        ))}
      </ul>

      <p className="dado mt-2 truncate text-[0.625rem] text-gelo-3" title={termo.hash}>
        SHA-256 {termo.hash}
      </p>

      <Button
        variante="contorno"
        tamanho="pequeno"
        className="mt-2 w-full"
        disabled={baixando}
        onClick={() => void baixar()}
      >
        {baixando ? 'Gerando…' : 'Baixar PDF'}
      </Button>
      {erro !== null && <p className="mt-2 text-xs text-vazio">{erro}</p>}
    </li>
  );
}
