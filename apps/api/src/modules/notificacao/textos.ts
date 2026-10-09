import { formatarDataHora } from '@medescala/contracts';

/**
 * Como um plantão aparece no texto de um aviso: onde e quando, no fuso da
 * apresentação (ADR-018). Um lugar só, para todos os avisos falarem igual.
 */
export function descreverPlantao(p: { setor: string; unidade: string; inicio: Date }): string {
  return `${p.setor} · ${p.unidade}, ${formatarDataHora(p.inicio)}`;
}
