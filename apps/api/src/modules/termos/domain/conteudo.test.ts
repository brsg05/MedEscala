import { describe, expect, it } from 'vitest';
import { canonico, hashDe, montarContrato, montarSubstituicao, registroDeCnpj } from './conteudo';

const PLANTAO = {
  id: '33333333-3333-4333-8333-333333333333',
  setor: 'Sala Vermelha',
  unidade: 'UPA Torrões',
  instituicao: 'Hospital Escola',
  inicio: '2026-10-10T10:00:00.000Z',
  fim: '2026-10-10T22:00:00.000Z',
  valorCentavos: 120_000,
  especialidade: 'Clínica Médica',
  modeloContratacao: 'PJ',
};
const MEDICO = { papel: 'MEDICO' as const, nome: 'Ana Medeiros', registro: 'CRM/PE 12345' };
const INSTITUICAO = {
  papel: 'INSTITUICAO' as const,
  nome: 'Hospital Escola',
  registro: 'CNPJ 12.345.678/0001-90',
};

function contrato() {
  return montarContrato({
    plantao: PLANTAO,
    medico: MEDICO,
    instituicao: INSTITUICAO,
    prazoContestacaoHoras: 72,
    emitidoEm: new Date('2026-10-01T12:00:00Z'),
  });
}

describe('conteúdo do termo (F13)', () => {
  it('o JSON canônico não depende da ordem das chaves', () => {
    expect(canonico({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } })).toBe(
      canonico({ a: { c: null, d: [2, { x: 2, y: 1 }] }, b: 1 }),
    );
  });

  it('o mesmo dado dá o mesmo hash; qualquer mudança dá outro (DEC-187)', () => {
    expect(hashDe(contrato())).toBe(hashDe(contrato()));
    expect(hashDe(contrato())).toMatch(/^[0-9a-f]{64}$/u);

    const outroValor = montarContrato({
      plantao: { ...PLANTAO, valorCentavos: 120_001 },
      medico: MEDICO,
      instituicao: INSTITUICAO,
      prazoContestacaoHoras: 72,
      emitidoEm: new Date('2026-10-01T12:00:00Z'),
    });
    expect(hashDe(outroValor)).not.toBe(hashDe(contrato()));
  });

  it('o hash sobrevive à volta pelo JSONB, que reordena as chaves', () => {
    const c = contrato();
    const doBanco = JSON.parse(JSON.stringify(c, Object.keys(c).sort().reverse())) as typeof c;
    expect(hashDe({ ...doBanco, ...c })).toBe(hashDe(c));
  });

  it('o contrato diz valor, prazo de contestação e a regra da RN01', () => {
    const texto = contrato().clausulas.join(' ');
    expect(texto).toContain('R$');
    expect(texto).toContain('1.200,00');
    expect(texto).toContain('72 horas');
    expect(texto).toContain('repasse aprovado pela instituição');
  });

  it('o termo de substituição tem as três partes e o modelo fiscal', () => {
    const t = montarSubstituicao({
      plantao: PLANTAO,
      titular: { ...MEDICO, papel: 'TITULAR' },
      substituto: { papel: 'SUBSTITUTO', nome: 'Bruno Lima', registro: 'CRM/PE 54321' },
      instituicao: INSTITUICAO,
      repasse: { id: 'r', motivo: 'Congresso', modeloFiscal: 'A_RECONTRATACAO' },
      aprovadoEm: new Date('2026-10-02T12:00:00Z'),
      emitidoEm: new Date('2026-10-02T12:00:00Z'),
    });
    expect(t.partes.map((p) => p.papel)).toEqual(['TITULAR', 'SUBSTITUTO', 'INSTITUICAO']);
    expect(t.clausulas.join(' ')).toContain('Modelo A');
  });

  it('formata o CNPJ', () => {
    expect(registroDeCnpj('12345678000190')).toBe('CNPJ 12.345.678/0001-90');
  });
});
