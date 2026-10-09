import { useState, type FormEvent } from 'react';
import {
  AbrirRepasseRequest,
  calcularRetencoes,
  type ModeloFiscal,
  formatarCentavos,
  formatarDataHora,
  type CandidatoResponse,
  type PlantaoResponse,
} from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { MontadorDeFila } from '@/componentes/MontadorDeFila';
import { ErroDeFormulario, Painel } from '@/componentes/Painel';
import { Button } from '@/componentes/ui/button';
import { Label } from '@/componentes/ui/label';

interface Props {
  plantao: PlantaoResponse;
  aoFechar: () => void;
  aoAbrir: () => void;
}

/**
 * F07 — abrir pedido de repasse, com a fila de convites (DEC-087).
 *
 * O aviso de responsabilidade vem ANTES do botão: a Entrega 1 (§5.1) diz que,
 * enquanto a escala não muda, o titular permanece responsável — e a confusão
 * sobre isso é uma das causas do problema que o produto ataca.
 */
export function PedirRepasse({ plantao, aoFechar, aoAbrir }: Props): React.JSX.Element {
  const [motivo, setMotivo] = useState('');
  const [modelo, setModelo] = useState<ModeloFiscal>('A_RECONTRATACAO');
  const [fila, setFila] = useState<CandidatoResponse[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);

    const validado = AbrirRepasseRequest.safeParse({
      motivo,
      modeloFiscal: modelo,
      indicados: fila.map((c) => c.id),
    });

    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'Dados inválidos');
      return;
    }

    setEnviando(true);

    try {
      await api.abrirRepasse(plantao.id, validado.data);
      aoAbrir();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível abrir o pedido');
      setEnviando(false);
    }
  }

  return (
    <Painel titulo="Pedir repasse" aoFechar={aoFechar}>
      <dl className="space-y-1.5 rounded-lg bg-tinta-3 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Setor</dt>
          <dd className="text-right text-gelo">{plantao.setor.nome}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Início</dt>
          <dd className="dado text-right text-gelo">{formatarDataHora(plantao.inicio)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gelo-3">Valor</dt>
          <dd className="dado text-right text-gelo">{formatarCentavos(plantao.valorCentavos)}</dd>
        </div>
      </dl>

      <form onSubmit={(e) => void enviar(e)} className="mt-5 space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo</Label>
          <textarea
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: convocação para junta médica no mesmo horário"
            className="w-full rounded-lg border border-borda bg-tinta-3 px-3 py-2.5 text-base text-gelo placeholder:text-gelo-3 focus:border-turno focus:outline-none"
          />
        </div>

        <MontadorDeFila plantaoId={plantao.id} fila={fila} aoMudar={setFila} />

        {plantao.setor.subcontratacaoPermitida && (
          <EscolhaDoModelo plantao={plantao} modelo={modelo} aoMudar={setModelo} />
        )}

        <ErroDeFormulario mensagem={erro} />

        <div className="flex gap-3">
          <Button type="button" variante="contorno" className="flex-1" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" disabled={enviando}>
            {enviando ? 'Abrindo…' : fila.length > 0 ? 'Abrir e convidar' : 'Abrir pedido'}
          </Button>
        </div>
      </form>
    </Painel>
  );
}

/**
 * Quadro 3 da Entrega 1 — modelo A (padrão: a instituição contrata o substituto)
 * ou B (o titular subcontrata), com o alerta explícito do efeito tributário
 * (DEC-203). Só aparece onde a instituição habilitou o B (DEC-207).
 */
function EscolhaDoModelo({
  plantao,
  modelo,
  aoMudar,
}: {
  plantao: PlantaoResponse;
  modelo: ModeloFiscal;
  aoMudar: (m: ModeloFiscal) => void;
}): React.JSX.Element {
  // Estimativa do que é retido DE NOVO na segunda nota (substituto → titular):
  // sem saber o regime do substituto, calcula como não optante do Simples.
  const segunda = calcularRetencoes({
    valorCentavos: plantao.valorCentavos,
    prestador: { modelo: plantao.modeloContratacao, regime: null },
    tomadorOptanteDoSimples: false,
    issRetidoBp: null,
    data: new Date(),
  });

  const opcoes: { valor: ModeloFiscal; titulo: string; texto: string }[] = [
    {
      valor: 'A_RECONTRATACAO',
      titulo: 'A — a instituição contrata o substituto',
      texto: 'Uma nota só, do substituto para a instituição. Recomendado.',
    },
    {
      valor: 'B_SUBCONTRATACAO',
      titulo: 'B — você subcontrata o substituto',
      texto: 'Duas notas: a sua para a instituição e a do substituto para você.',
    },
  ];

  return (
    <fieldset className="space-y-2">
      <legend className="sinal mb-2">Modelo do repasse</legend>
      {opcoes.map((o) => (
        <label
          key={o.valor}
          className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 ${
            modelo === o.valor ? 'border-turno bg-tinta-3' : 'border-borda'
          }`}
        >
          <input
            type="radio"
            name="modelo-fiscal"
            value={o.valor}
            checked={modelo === o.valor}
            onChange={() => aoMudar(o.valor)}
            className="mt-1 accent-[var(--color-turno)]"
          />
          <span>
            <span className="block text-sm text-gelo">{o.titulo}</span>
            <span className="block text-xs text-gelo-3">{o.texto}</span>
          </span>
        </label>
      ))}
      {modelo === 'B_SUBCONTRATACAO' && (
        <p
          role="alert"
          className="rounded-lg border border-vazio/30 bg-vazio-fundo px-3 py-2.5 text-xs leading-relaxed text-vazio"
        >
          <strong className="font-semibold">Atenção à dupla tributação.</strong> No Simples Nacional
          e no Lucro Presumido, o imposto incide sobre a receita bruta: você é tributado pelo valor
          cheio, e o substituto de novo pela parte dele. Só na segunda nota, até{' '}
          <strong className="dado">{formatarCentavos(segunda.retidoCentavos)}</strong> são retidos
          na fonte outra vez (IRRF e PIS/COFINS/CSLL). No modelo A isso não acontece. Estimativa
          simulada — confirme com seu contador.
        </p>
      )}
    </fieldset>
  );
}
