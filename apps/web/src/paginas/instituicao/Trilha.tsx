import { useCallback } from 'react';
import { formatarData, formatarHora, type PlantaoResponse } from '@medescala/contracts';
import { api } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { ErroDeFormulario, Painel } from '@/componentes/Painel';

/** Ação gravada na trilha → frase que uma pessoa entende. */
const ACAO_LEGIVEL: Record<string, string> = {
  VAGA_PUBLICADA: 'Vaga publicada',
  CONVITES_DA_VAGA: 'Convites da vaga enviados',
  CONVITE_DA_VAGA_ACEITO: 'Convite da vaga aceito',
  FILA_DA_VAGA_ENCERRADA: 'Convites da vaga encerrados',
  CANDIDATURA_ENVIADA: 'Candidatura recebida',
  CANDIDATURA_RETIRADA: 'Candidatura retirada',
  CANDIDATURA_RECUSADA: 'Candidatura recusada',
  MEDICO_ESCALADO: 'Médico escalado',
  REPASSE_SOLICITADO: 'Titular pediu repasse',
  PLANTAO_EM_REPASSE: 'Plantão entrou em repasse',
  MATCHING_LOTE: 'Convidados selecionados automaticamente',
  CONVITE_ENVIADO: 'Convite enviado',
  CONVITE_RECUSADO: 'Convite recusado',
  CONVITE_EXPIRADO: 'Convite expirou sem resposta',
  FILA_ESGOTADA: 'Ninguém aceitou o convite',
  FILA_RETOMADA: 'Convites retomados',
  REPASSE_ACEITO_PELO_SUBSTITUTO: 'Substituto aceitou',
  REPASSE_ENVIADO_PARA_APROVACAO: 'Enviado para a chefia',
  REPASSE_APROVADO: 'Chefia aprovou o repasse',
  REPASSE_RECUSADO_PELA_INSTITUICAO: 'Chefia recusou o substituto',
  REPASSE_CANCELADO_PELO_TITULAR: 'Titular cancelou o repasse',
  REPASSE_CANCELADO_INICIO_DO_PLANTAO: 'Repasse encerrado no início do plantão',
  EXECUTANTE_SUBSTITUIDO: 'Escala oficial atualizada',
  CHECKIN_REGISTRADO: 'Check-in',
  CHECKOUT_REGISTRADO: 'Check-out',
  EXECUCAO_CONFIRMADA_PELA_INSTITUICAO: 'Instituição confirmou o plantão',
  PLANTAO_CONTESTADO: 'Instituição contestou o plantão',
  CONTESTACAO_RESPONDIDA: 'Médico respondeu à contestação',
  CONTESTACAO_RESOLVIDA: 'Contestação decidida',
  PAGAMENTO_PRE_AUTORIZADO: 'Valor reservado',
  PAGAMENTO_CANCELADO: 'Reserva cancelada',
  PAGAMENTO_RETIDO: 'Valor retido em garantia',
  NFSE_EMITIDA: 'NFS-e emitida',
  PAGAMENTO_LIBERADO: 'Pagamento liberado',
  PAGAMENTO_ESTORNADO: 'Pagamento estornado',
  PLANTAO_LIQUIDADO: 'Plantão liquidado',
};

/** Ação sem rótulo cai num texto legível, nunca no código cru. */
function legivel(acao: string): string {
  const texto = acao.toLowerCase().replaceAll('_', ' ');
  return ACAO_LEGIVEL[acao] ?? texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * F23 — trilha de auditoria do plantão.
 *
 * O número de cada linha é a sequência gravada pelo banco, não um enfeite: o
 * critério do Sprint 3 é "a consulta devolve a sequência exata de eventos", e a
 * ordem aqui é a mesma que a do Postgres. A trilha é append-only por trigger — o
 * que está nesta lista não pode ser alterado nem apagado por ninguém.
 */
export function Trilha({
  plantao,
  aoFechar,
}: {
  plantao: PlantaoResponse;
  aoFechar: () => void;
}): React.JSX.Element {
  const buscar = useCallback(() => api.trilha(plantao.id), [plantao.id]);
  const trilha = useRecurso(buscar, [plantao.id]);

  return (
    <Painel titulo="Trilha do plantão" aoFechar={aoFechar}>
      <p className="text-sm text-gelo-2">
        {plantao.setor.nome} · <span className="dado">{formatarData(plantao.inicio)}</span>
      </p>

      <ErroDeFormulario mensagem={trilha.erro} />

      {trilha.carregando && (
        <div
          className="mt-4 h-32 animate-pulse rounded-lg bg-tinta-3"
          aria-label="Carregando trilha"
        />
      )}

      {trilha.dado !== null && (
        <ol className="mt-4 divide-y divide-borda rounded-lg border border-borda">
          {trilha.dado.map((e) => (
            <li key={e.id} className="grid grid-cols-[3rem_1fr] gap-3 px-3 py-2.5">
              <span className="dado pt-0.5 text-[0.6875rem] text-gelo-3">#{e.id}</span>
              <span className="min-w-0">
                <span className="block text-sm text-gelo">{legivel(e.acao)}</span>
                <span className="dado block text-[0.6875rem] text-gelo-3">
                  {formatarData(e.ocorridoEm)} {formatarHora(e.ocorridoEm)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Painel>
  );
}
