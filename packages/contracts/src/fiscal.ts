import { z } from 'zod';

/**
 * F14 — retenções do rascunho fiscal (DEC-205, DEC-206).
 *
 * Mora aqui, e não só na api, porque o web estima o efeito do modelo B antes da
 * escolha (DEC-203) e precisa chegar ao MESMO número (ADR-018).
 *
 * Tabela versionada por vigência (guia, §3.2): a reforma tributária (LC 214/2025)
 * é um alvo móvel, e regra nova entra como linha nova, com fonte — nunca como
 * constante trocada no lugar (§16: nenhum número sem fonte primária).
 *
 * É SIMULAÇÃO: serve para mostrar o que seria retido e para o fluxo do split
 * (F17). Não é orientação tributária.
 */

/** Regime do prestador, como cadastrado no F02 (nulo = dados fiscais incompletos). */
type Regime = 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';

export interface RegraFiscal {
  vigenteDesde: string;
  vigenteAte: string | null;
  /** Em pontos-base: 150 = 1,5%. Inteiros, para não haver ponto flutuante (ADR-018). */
  irrfBp: number;
  csrfBp: number;
  /** Retenção de até este valor é dispensada (por nota, sem acumular). */
  dispensaAteCentavos: number;
  fontes: readonly string[];
}

export const REGRAS_FISCAIS: readonly RegraFiscal[] = [
  {
    // Lei 13.137/2015 trocou a dispensa do PIS/COFINS/CSLL (de R$ 5.000 de
    // pagamento para R$ 10 de retenção), em vigor desde 22/06/2015.
    vigenteDesde: '2015-06-22',
    vigenteAte: null,
    irrfBp: 150,
    csrfBp: 465,
    dispensaAteCentavos: 1_000,
    fontes: [
      'IRRF 1,5% sobre serviços profissionais (medicina): Regulamento do Imposto de Renda (Decreto 9.580/2018); Entrega 1, §5.3',
      'Dispensa do IRRF de até R$ 10: Lei 9.430/1996, art. 67; Solução de Consulta Cosit 467/2017',
      'PIS/COFINS/CSLL 4,65% (0,65% + 3% + 1%): Lei 10.833/2003, arts. 30 e 31; Entrega 1, §5.3',
      'Dispensa do PIS/COFINS/CSLL de até R$ 10: Lei 13.137/2015',
      'Sem IRRF de prestador do Simples Nacional: IN SRF 765/2007, art. 1º',
      'Sem PIS/COFINS/CSLL de prestador do Simples Nacional: IN SRF 459/2004, art. 3º',
    ],
  },
];

export function regraVigente(data: Date): RegraFiscal {
  const dia = data.toISOString().slice(0, 10);
  const regra = REGRAS_FISCAIS.find(
    (r) => r.vigenteDesde <= dia && (r.vigenteAte === null || dia <= r.vigenteAte),
  );
  if (regra === undefined) {
    throw new Error(`Nenhuma regra fiscal vigente em ${dia}`);
  }
  return regra;
}

export const Tributo = z.enum(['IRRF', 'PIS_COFINS_CSLL', 'ISS']);
export type Tributo = z.infer<typeof Tributo>;

export const ROTULO_TRIBUTO: Readonly<Record<Tributo, string>> = {
  IRRF: 'IRRF',
  PIS_COFINS_CSLL: 'PIS/COFINS/CSLL',
  ISS: 'ISS',
};

export const LinhaDeRetencao = z.strictObject({
  tributo: Tributo,
  aliquotaBp: z.number().int().nonnegative(),
  valorCentavos: z.number().int().nonnegative(),
  /** Falso quando a regra dispensa a retenção; `motivo` diz qual. */
  retido: z.boolean(),
  motivo: z.string().nullable(),
});
export type LinhaDeRetencao = z.infer<typeof LinhaDeRetencao>;

export interface Retencoes {
  linhas: LinhaDeRetencao[];
  retidoCentavos: number;
  liquidoCentavos: number;
  observacoes: string[];
}

/** Arredonda meio para cima, em centavos inteiros. */
function aplicar(valorCentavos: number, bp: number): number {
  return Math.floor((valorCentavos * bp + 5_000) / 10_000);
}

/**
 * O que a tomadora retém na fonte ao pagar o prestador (DEC-205, DEC-206).
 *
 * @param issRetidoBp — alíquota de ISS que o município manda a tomadora reter
 *   (configurada pela instituição); nula quando não há retenção na fonte.
 */
export function calcularRetencoes(entrada: {
  valorCentavos: number;
  prestador: { modelo: 'PJ' | 'RPA'; regime: Regime | null };
  tomadorOptanteDoSimples: boolean;
  issRetidoBp: number | null;
  data: Date;
}): Retencoes {
  const { valorCentavos: valor, prestador } = entrada;
  const regra = regraVigente(entrada.data);
  const observacoes: string[] = [];

  if (prestador.modelo === 'RPA') {
    return {
      linhas: [],
      retidoCentavos: 0,
      liquidoCentavos: valor,
      observacoes: [
        'Pagamento a pessoa física (RPA): INSS e IRRF dependem da tabela da pessoa física e não são calculados neste rascunho.',
      ],
    };
  }

  if (prestador.regime === null) {
    observacoes.push(
      'Dados fiscais do médico incompletos: o cálculo supõe que ele NÃO é optante do Simples Nacional.',
    );
  }

  const simples = prestador.regime === 'SIMPLES_NACIONAL';
  const linhas: LinhaDeRetencao[] = [];

  const federal = (tributo: Tributo, bp: number, isento: string | null): void => {
    const calculado = aplicar(valor, bp);
    const motivo =
      isento ??
      (calculado <= regra.dispensaAteCentavos ? 'Dispensada: retenção de até R$ 10' : null);
    linhas.push({
      tributo,
      aliquotaBp: bp,
      valorCentavos: calculado,
      retido: motivo === null,
      motivo,
    });
  };

  federal('IRRF', regra.irrfBp, simples ? 'Prestador optante do Simples Nacional' : null);
  federal(
    'PIS_COFINS_CSLL',
    regra.csrfBp,
    simples
      ? 'Prestador optante do Simples Nacional'
      : entrada.tomadorOptanteDoSimples
        ? 'Tomador optante do Simples Nacional'
        : null,
  );

  if (entrada.issRetidoBp === null) {
    observacoes.push(
      'ISS: a tomadora não retém na fonte; o prestador recolhe no município conforme a regra local.',
    );
  } else {
    linhas.push({
      tributo: 'ISS',
      aliquotaBp: entrada.issRetidoBp,
      valorCentavos: aplicar(valor, entrada.issRetidoBp),
      retido: true,
      motivo: null,
    });
  }

  const retido = linhas.filter((l) => l.retido).reduce((s, l) => s + l.valorCentavos, 0);
  return { linhas, retidoCentavos: retido, liquidoCentavos: valor - retido, observacoes };
}

/** Para exibir pontos-base como percentual: 465 → "4,65%". */
export function formatarAliquota(bp: number): string {
  return `${(bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

// --- leitura do financeiro de um plantão (F15, F17) ---------------------------

export const PernaPagamento = z.enum(['PRINCIPAL', 'SUBCONTRATACAO']);
export type PernaPagamento = z.infer<typeof PernaPagamento>;

export const StatusPagamento = z.enum([
  'PRE_AUTORIZADO',
  'RETIDO',
  'LIBERADO',
  'CANCELADO',
  'ESTORNADO',
]);
export type StatusPagamento = z.infer<typeof StatusPagamento>;

export const ROTULO_STATUS_PAGAMENTO: Readonly<Record<StatusPagamento, string>> = {
  PRE_AUTORIZADO: 'Valor reservado',
  RETIDO: 'Retido em garantia',
  LIBERADO: 'Liberado',
  CANCELADO: 'Reserva cancelada',
  ESTORNADO: 'Estornado',
};

export const StatusDocumentoFiscal = z.enum(['RASCUNHO', 'EMITIDA', 'CANCELADA']);
export type StatusDocumentoFiscal = z.infer<typeof StatusDocumentoFiscal>;

export const FinanceiroResponse = z.strictObject({
  pernas: z.array(
    z.strictObject({
      id: z.uuid(),
      perna: PernaPagamento,
      status: StatusPagamento,
      pagador: z.string(),
      beneficiario: z.string(),
      valorBrutoCentavos: z.number().int(),
      retidoCentavos: z.number().int(),
      taxaPlataformaCentavos: z.number().int(),
      liquidoCentavos: z.number().int(),
      preAutorizadoEm: z.iso.datetime(),
      retidoEm: z.iso.datetime().nullable(),
      /** A partir de quando a plataforma emite a nota pelo médico e libera (DEC-202). */
      liberavelEm: z.iso.datetime().nullable(),
      liberadoEm: z.iso.datetime().nullable(),
      documentoFiscal: z
        .strictObject({
          id: z.uuid(),
          status: StatusDocumentoFiscal,
          prestadorNome: z.string(),
          prestadorRegistro: z.string(),
          tomadorNome: z.string(),
          tomadorRegistro: z.string(),
          discriminacao: z.string(),
          valorServicoCentavos: z.number().int(),
          retencoes: z.array(LinhaDeRetencao),
          observacoes: z.array(z.string()),
          valorLiquidoCentavos: z.number().int(),
          numero: z.string().nullable(),
          codigoVerificacao: z.string().nullable(),
          emitidaEm: z.iso.datetime().nullable(),
          emitidaPor: z.enum(['MEDICO', 'AUTOMATICA']).nullable(),
          /** Só para o prestador, com o plantão cumprido e fora de contestação. */
          podeEmitir: z.boolean(),
        })
        .nullable(),
    }),
  ),
});
export type FinanceiroResponse = z.infer<typeof FinanceiroResponse>;
