/**
 * RN03 — sobreposição e carga horária.
 *
 * "O sistema bloqueia sobreposição de horários e alerta quando a soma de
 * plantões contíguos ultrapassar o limite de 24 horas."
 *
 * São duas regras com forças diferentes, e o código as trata diferente:
 *
 * - **sobreposição é bloqueio**, e o bloqueio real está no banco (exclusion
 *   constraint em `supabase/policies/002`). As funções daqui existem para o
 *   sistema recusar com uma mensagem de domínio antes de bater na constraint,
 *   e para serem testáveis sem banco;
 * - **as 24h contíguas são alerta**, não impedimento. A RN09 proíbe a plataforma
 *   de definir jornada — bloquear aqui seria exercer poder diretivo e aproximar
 *   a operação de vínculo empregatício, exatamente o risco que a Entrega 1
 *   (§5.5) manda evitar.
 */

export interface Turno {
  inicio: Date;
  fim: Date;
}

export const LIMITE_HORAS_CONTIGUAS = 24;

/** Intervalos fechado-aberto `[inicio, fim)`: encostar não é sobrepor. */
export function sobrepoe(a: Turno, b: Turno): boolean {
  return a.inicio < b.fim && b.inicio < a.fim;
}

export function encontrarSobreposicao<T extends Turno>(
  novo: Turno,
  existentes: readonly T[],
): T | null {
  return existentes.find((t) => sobrepoe(novo, t)) ?? null;
}

export function duracaoEmHoras(turno: Turno): number {
  return (turno.fim.getTime() - turno.inicio.getTime()) / 3_600_000;
}

/**
 * Soma a maior sequência de turnos que se tocam sem intervalo, incluindo o novo.
 *
 * Dois plantões de 12h colados viram 24h de trabalho ininterrupto — é isso que a
 * RN03 quer enxergar, e o que uma soma por dia de calendário não veria, porque a
 * sequência atravessa a meia-noite.
 */
export function horasContiguasComOTurno(novo: Turno, existentes: readonly Turno[]): number {
  const ordenados = [...existentes, novo].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  let maiorSequencia = 0;
  let acumulado = 0;
  let fimDaSequencia: number | null = null;

  for (const turno of ordenados) {
    const encosta = fimDaSequencia !== null && turno.inicio.getTime() <= fimDaSequencia;

    acumulado = encosta ? acumulado + duracaoEmHoras(turno) : duracaoEmHoras(turno);
    fimDaSequencia = Math.max(fimDaSequencia ?? 0, turno.fim.getTime());
    maiorSequencia = Math.max(maiorSequencia, acumulado);
  }

  return maiorSequencia;
}

export function excedeLimiteContiguo(novo: Turno, existentes: readonly Turno[]): boolean {
  return horasContiguasComOTurno(novo, existentes) > LIMITE_HORAS_CONTIGUAS;
}

/**
 * F07 — o repasse tem que ser pedido com antecedência mínima.
 *
 * O §8 do guia exige "prazo > mínimo" sem dizer qual; o valor vem da instituição
 * (RN08 fala em "prazo definido pela instituição"), com padrão de 24h.
 */
export function respeitaAntecedenciaMinima(
  inicioDoPlantao: Date,
  horasMinimas: number,
  agora: Date = new Date(),
): boolean {
  return inicioDoPlantao.getTime() - agora.getTime() >= horasMinimas * 3_600_000;
}
