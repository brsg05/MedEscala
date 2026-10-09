import { useCallback, useState, type FormEvent } from 'react';
import {
  centavosDeTexto,
  CriarDisponibilidadeRequest,
  formatarCentavos,
  formatarDataHora,
  type DisponibilidadeResponse,
} from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { ErroDeFormulario } from '@/componentes/Painel';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { doCampoLocal, paraCampoLocal, UM_DIA_MS, UMA_HORA_MS } from '@/lib/datas';
import { VagasAbertas } from './VagasAbertas';

/**
 * F04 — declarar disponibilidade; e, desde a F10, procurar vaga (DEC-168).
 *
 * Com a DEC-062 esta tela virou a porta de entrada do médico no mercado: a
 * chefia só enxerga quem declarou janela cobrindo o horário da vaga. O texto do
 * topo diz isso com todas as letras, porque é contraintuitivo — o médico pode
 * achar que basta ter cadastro para aparecer.
 */
export function Disponibilidade(): React.JSX.Element {
  const buscarJanelas = useCallback(() => api.disponibilidades(), []);
  const janelas = useRecurso(buscarJanelas, []);

  const buscarCadastro = useCallback(() => api.meuCadastroMedico(), []);
  const cadastro = useRecurso(buscarCadastro, []);

  const agora = Date.now();
  const futuras = (janelas.dado ?? []).filter((j) => Date.parse(j.fim) > agora);

  return (
    <div className="space-y-6">
      <header>
        <p className="sinal">Quando você pode trabalhar</p>
        <h1
          className="mt-2 text-2xl font-extrabold tracking-tight text-gelo"
          style={{ fontFamily: 'var(--font-sinal)' }}
        >
          Disponibilidade
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gelo-2">
          Uma chefia só encontra você para os horários que você declarar aqui. Fora dessas janelas,
          você não aparece em busca nenhuma — mas pode procurar vagas abertas e se candidatar.
        </p>
      </header>

      {cadastro.dado !== null && !cadastro.dado.verificado && (
        <p className="rounded-lg border border-espera/25 bg-espera-fundo px-3 py-2.5 text-sm leading-relaxed text-espera">
          Seu CRM ainda está em conferência. Você já pode declarar disponibilidade, mas só aparece
          para as chefias depois da verificação.
        </p>
      )}

      <NovaJanela aoCriar={janelas.recarregar} />

      <section aria-label="Janelas declaradas" className="space-y-2">
        <p className="sinal">Janelas declaradas</p>

        {janelas.erro !== null && <ErroDeFormulario mensagem={janelas.erro} />}

        {janelas.carregando && (
          <div
            className="h-20 animate-pulse rounded-xl border border-borda bg-tinta-2"
            aria-label="Carregando"
          />
        )}

        {!janelas.carregando && futuras.length === 0 && janelas.erro === null && (
          <p className="rounded-xl border border-dashed border-borda px-4 py-6 text-center text-sm text-gelo-3">
            Nenhuma janela futura. Declare uma acima para começar a aparecer nas buscas.
          </p>
        )}

        {futuras.map((j) => (
          <JanelaDeclarada key={j.id} janela={j} aoRemover={janelas.recarregar} />
        ))}
      </section>

      <VagasAbertas />
    </div>
  );
}

function NovaJanela({ aoCriar }: { aoCriar: () => void }): React.JSX.Element {
  // Sugestão inicial: amanhã, das 7h às 19h — o plantão diurno mais comum.
  const amanha7h = new Date(Date.now() + UM_DIA_MS);
  amanha7h.setHours(7, 0, 0, 0);

  const [inicio, setInicio] = useState(paraCampoLocal(amanha7h));
  const [fim, setFim] = useState(paraCampoLocal(new Date(amanha7h.getTime() + 12 * UMA_HORA_MS)));
  const [valorMinimo, setValorMinimo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);

    let valorMinimoCentavos: number | null = null;
    if (valorMinimo.trim() !== '') {
      try {
        valorMinimoCentavos = centavosDeTexto(valorMinimo);
      } catch {
        setErro('Valor mínimo inválido. Use o formato 1.200,00');
        return;
      }
    }

    const validado = CriarDisponibilidadeRequest.safeParse({
      inicio: doCampoLocal(inicio),
      fim: doCampoLocal(fim),
      valorMinimoCentavos,
    });

    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'Dados inválidos');
      return;
    }

    setEnviando(true);
    try {
      await api.declararDisponibilidade(validado.data);
      setValorMinimo('');
      aoCriar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível declarar a janela');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      className="space-y-4 rounded-xl border border-borda bg-tinta-2 p-5"
      noValidate
    >
      <p className="sinal">Nova janela</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="janela-inicio">Disponível a partir de</Label>
          <Input
            id="janela-inicio"
            type="datetime-local"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="janela-fim">Até</Label>
          <Input
            id="janela-fim"
            type="datetime-local"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="janela-valor">Valor mínimo por plantão (opcional)</Label>
        <Input
          id="janela-valor"
          inputMode="decimal"
          placeholder="Ex.: 1.200,00"
          value={valorMinimo}
          onChange={(e) => setValorMinimo(e.target.value)}
        />
        <p className="text-xs text-gelo-3">
          Vagas abaixo deste valor não mostram você como candidato.
        </p>
      </div>

      <ErroDeFormulario mensagem={erro} />

      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? 'Declarando…' : 'Declarar janela'}
      </Button>
    </form>
  );
}

function JanelaDeclarada({
  janela,
  aoRemover,
}: {
  janela: DisponibilidadeResponse;
  aoRemover: () => void;
}): React.JSX.Element {
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const horas = Math.round((Date.parse(janela.fim) - Date.parse(janela.inicio)) / UMA_HORA_MS);

  async function remover(): Promise<void> {
    setRemovendo(true);
    setErro(null);
    try {
      await api.removerDisponibilidade(janela.id);
      aoRemover();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível retirar a janela');
      setRemovendo(false);
    }
  }

  return (
    <article className="rounded-xl border border-borda bg-tinta-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="dado text-sm text-gelo">
            {formatarDataHora(janela.inicio)} → {formatarDataHora(janela.fim)}
          </p>
          <p className="mt-1 text-xs text-gelo-3">
            {horas}h ·{' '}
            {janela.valorMinimoCentavos === null
              ? 'qualquer valor'
              : `mínimo ${formatarCentavos(janela.valorMinimoCentavos)}`}
          </p>
        </div>
        <Button
          variante="discreto"
          tamanho="pequeno"
          onClick={() => void remover()}
          disabled={removendo}
        >
          {removendo ? 'Retirando…' : 'Retirar'}
        </Button>
      </div>
      {erro !== null && <p className="mt-2 text-xs text-vazio">{erro}</p>}
    </article>
  );
}
