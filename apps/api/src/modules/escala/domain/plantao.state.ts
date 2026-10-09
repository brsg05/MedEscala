import type { StatusPlantao } from '@prisma/client';

/**
 * Transições do plantão.
 *
 * O §7.3 do guia desenha o diagrama do `Plantao` mas, ao contrário do `Repasse`,
 * não fornece a tabela — esta é a lacuna preenchida pela ADR-020.
 *
 * `CONTESTADO` tem saída: no diagrama original ele era um beco sem saída, o que
 * conflitava com a RN04 (todo valor liquidado tem documento fiscal) — um plantão
 * travado nunca liquida nem cancela. A resolução cabe à instituição, que é quem
 * tem o contrato.
 */
const TRANSICOES: Readonly<Record<StatusPlantao, readonly StatusPlantao[]>> = {
  ABERTO: ['EM_SELECAO', 'CANCELADO'],
  // Volta para ABERTO quando o convite expira sem resposta (F10).
  EM_SELECAO: ['CONFIRMADO', 'ABERTO', 'CANCELADO'],
  // EXECUTADO e CONTESTADO direto de CONFIRMADO: plantão que terminou sem
  // check-in, quando a instituição confirma ou contesta (DEC-131).
  CONFIRMADO: ['EM_REPASSE', 'EM_EXECUCAO', 'EXECUTADO', 'CONTESTADO', 'CANCELADO'],
  // O repasse aprovado devolve o plantão a CONFIRMADO, agora com outro executante.
  EM_REPASSE: ['CONFIRMADO', 'CANCELADO'],
  EM_EXECUCAO: ['EXECUTADO', 'CONTESTADO'],
  EXECUTADO: ['LIQUIDADO', 'CONTESTADO'],
  // Contestação improcedente segue para liquidação; procedente cancela.
  CONTESTADO: ['EXECUTADO', 'CANCELADO'],
  LIQUIDADO: [],
  CANCELADO: [],
};

export function podeTransicionar(de: StatusPlantao, para: StatusPlantao): boolean {
  return TRANSICOES[de].includes(para);
}

export function transicoesDe(de: StatusPlantao): readonly StatusPlantao[] {
  return TRANSICOES[de];
}

export function ehTerminal(status: StatusPlantao): boolean {
  return TRANSICOES[status].length === 0;
}

/** Estados em que o plantão já tem dono e ocupa a agenda de alguém (RN03). */
export function ocupaAgenda(status: StatusPlantao): boolean {
  return status !== 'CANCELADO';
}

/**
 * Só um plantão CONFIRMADO pode ser repassado (§8 do guia).
 *
 * Antes disso não há o que repassar, e depois de iniciada a execução a troca
 * deixa de ser substituição: vira abandono de plantão, que o Código de Ética
 * veda (Entrega 1, §5.1).
 */
export function aceitaRepasse(status: StatusPlantao): boolean {
  return status === 'CONFIRMADO';
}
