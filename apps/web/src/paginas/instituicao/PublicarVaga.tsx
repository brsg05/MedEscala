import { useState, type FormEvent } from 'react';
import {
  centavosDeTexto,
  CriarPlantaoRequest,
  formatarDataHora,
  type EstruturaResponse,
  type ModeloContratacao,
} from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { ErroDeFormulario, Painel } from '@/componentes/Painel';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { cn } from '@/lib/utils';
import { doCampoLocal, paraCampoLocal, UMA_HORA_MS } from '@/lib/datas';

/** Durações que cobrem os turnos reais: meio período, diurno/noturno, 24h. */
const DURACOES = [6, 12, 24] as const;

/**
 * F06 — publicar vaga de plantão.
 *
 * A especialidade exigida vem do setor e não é digitada: ela é comparada com a
 * do médico na RN02, e texto livre aqui seria um jeito fácil de criar vaga que
 * ninguém pode cobrir (ver "Especialidade" em aberto no changelog).
 */
export function PublicarVaga({
  estrutura,
  diaSugerido,
  aoFechar,
  aoPublicar,
}: {
  estrutura: EstruturaResponse;
  diaSugerido: Date;
  aoFechar: () => void;
  aoPublicar: () => void;
}): React.JSX.Element {
  const setores = estrutura.unidades.flatMap((u) =>
    u.setores.map((s) => ({ ...s, unidade: u.nome })),
  );

  const sugestao = new Date(diaSugerido);
  sugestao.setHours(7, 0, 0, 0);
  if (sugestao.getTime() < Date.now()) {
    sugestao.setHours(19, 0, 0, 0);
  }

  const [setorId, setSetorId] = useState(setores[0]?.id ?? '');
  const [inicio, setInicio] = useState(paraCampoLocal(sugestao));
  const [horas, setHoras] = useState<number>(12);
  const [valor, setValor] = useState('1.400,00');
  const [modelo, setModelo] = useState<ModeloContratacao>('PJ');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const setor = setores.find((s) => s.id === setorId);
  const inicioIso = doCampoLocal(inicio);
  const fimIso =
    inicioIso === null ? null : new Date(Date.parse(inicioIso) + horas * UMA_HORA_MS).toISOString();

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);

    let valorCentavos: number;
    try {
      valorCentavos = centavosDeTexto(valor);
    } catch {
      setErro('Valor inválido. Use o formato 1.400,00');
      return;
    }

    const validado = CriarPlantaoRequest.safeParse({
      setorId,
      inicio: inicioIso,
      fim: fimIso,
      valorCentavos,
      especialidadeExigida: setor?.especialidadeExigida ?? '',
      requisitos: [],
      modeloContratacao: modelo,
    });

    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'Dados inválidos');
      return;
    }

    setEnviando(true);
    try {
      await api.publicarVaga(validado.data);
      aoPublicar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível publicar a vaga');
      setEnviando(false);
    }
  }

  return (
    <Painel titulo="Publicar vaga" aoFechar={aoFechar}>
      <form onSubmit={(e) => void enviar(e)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="vaga-setor">Setor</Label>
          <select
            id="vaga-setor"
            value={setorId}
            onChange={(e) => setSetorId(e.target.value)}
            className="flex h-12 w-full rounded-lg border border-borda bg-tinta-3 px-3 text-base text-gelo"
          >
            {estrutura.unidades.map((u) => (
              <optgroup key={u.id} label={u.nome}>
                {u.setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {setor !== undefined && (
            <p className="text-xs text-gelo-3">Exige {setor.especialidadeExigida}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="vaga-inicio">Início</Label>
          <Input
            id="vaga-inicio"
            type="datetime-local"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="sinal">Duração</legend>
          <div className="grid grid-cols-3 gap-2">
            {DURACOES.map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={horas === h}
                onClick={() => setHoras(h)}
                className={cn(
                  'dado h-11 rounded-lg border text-sm transition-colors',
                  horas === h
                    ? 'border-turno bg-turno-fundo text-turno'
                    : 'border-borda bg-tinta-3 text-gelo-2',
                )}
              >
                {h}h
              </button>
            ))}
          </div>
          {fimIso !== null && (
            <p className="dado text-xs text-gelo-3">Termina em {formatarDataHora(fimIso)}</p>
          )}
        </fieldset>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div className="space-y-2">
            <Label htmlFor="vaga-valor">Valor do plantão</Label>
            <Input
              id="vaga-valor"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="sinal">Contratação</legend>
            <div className="flex gap-1">
              {(['PJ', 'RPA'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={modelo === m}
                  onClick={() => setModelo(m)}
                  className={cn(
                    'h-12 w-14 rounded-lg border text-sm transition-colors',
                    modelo === m
                      ? 'border-turno bg-turno-fundo text-turno'
                      : 'border-borda bg-tinta-3 text-gelo-2',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <ErroDeFormulario mensagem={erro} />

        <Button type="submit" className="w-full" disabled={enviando || setorId === ''}>
          {enviando ? 'Publicando…' : 'Publicar vaga'}
        </Button>
      </form>
    </Painel>
  );
}
