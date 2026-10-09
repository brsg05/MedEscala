import { useState, type FormEvent } from 'react';
import {
  AbrirRepasseRequest,
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
  const [fila, setFila] = useState<CandidatoResponse[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);

    const validado = AbrirRepasseRequest.safeParse({
      motivo,
      modeloFiscal: 'A_RECONTRATACAO',
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
          <p className="text-xs text-gelo-3">
            Fica registrado na trilha de auditoria e é visto pela chefia.
          </p>
        </div>

        <MontadorDeFila plantaoId={plantao.id} fila={fila} aoMudar={setFila} />

        <p className="rounded-lg border border-espera/25 bg-espera-fundo px-3 py-2.5 text-xs leading-relaxed text-espera">
          Abrir o pedido não transfere o plantão. Enquanto a instituição não aprovar, a escala
          oficial não muda e <strong className="font-semibold">você segue responsável</strong>.
        </p>

        <ErroDeFormulario mensagem={erro} />

        <div className="flex gap-3">
          <Button type="button" variante="contorno" className="flex-1" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" disabled={enviando}>
            {enviando ? 'Abrindo…' : fila.length > 0 ? 'Abrir e convidar' : 'Abrir convite aberto'}
          </Button>
        </div>
      </form>
    </Painel>
  );
}
