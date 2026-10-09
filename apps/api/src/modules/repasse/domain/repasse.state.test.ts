import { describe, expect, it } from 'vitest';
import type { StatusPlantao, StatusRepasse } from '@prisma/client';
import {
  aceitaRepasse,
  ehTerminal,
  podeTransicionar as plantaoPodeTransicionar,
} from '../../escala/domain/plantao.state';
import { concluiSubstituicao, estaEmAberto, podeTransicionar, transicoesDe } from './repasse.state';

describe('máquina de estados do repasse (§7.3)', () => {
  it('segue o caminho feliz até a aprovação', () => {
    expect(podeTransicionar('SOLICITADO', 'SUBSTITUTO_ACEITO')).toBe(true);
    expect(podeTransicionar('SUBSTITUTO_ACEITO', 'AGUARDANDO_APROVACAO')).toBe(true);
    expect(podeTransicionar('AGUARDANDO_APROVACAO', 'APROVADO')).toBe(true);
  });

  it('NÃO deixa pular a aprovação da chefia — RN01', () => {
    // O atalho que o produto existe para impedir: titular e substituto
    // combinando entre si e a substituição valendo.
    expect(podeTransicionar('SOLICITADO', 'APROVADO')).toBe(false);
    expect(podeTransicionar('SUBSTITUTO_ACEITO', 'APROVADO')).toBe(false);
  });

  it('trata APROVADO e CANCELADO como terminais', () => {
    expect(transicoesDe('APROVADO')).toHaveLength(0);
    expect(transicoesDe('CANCELADO')).toHaveLength(0);
  });

  it('não ressuscita um repasse aprovado', () => {
    const todos: readonly StatusRepasse[] = [
      'SOLICITADO',
      'SUBSTITUTO_ACEITO',
      'AGUARDANDO_APROVACAO',
      'APROVADO',
      'RECUSADO_SUBSTITUTO',
      'RECUSADO_INSTITUICAO',
      'CANCELADO',
    ];
    for (const destino of todos) {
      expect(podeTransicionar('APROVADO', destino)).toBe(false);
    }
  });

  it('devolve a SOLICITADO depois de qualquer recusa', () => {
    expect(podeTransicionar('RECUSADO_SUBSTITUTO', 'SOLICITADO')).toBe(true);
    expect(podeTransicionar('RECUSADO_INSTITUICAO', 'SOLICITADO')).toBe(true);
  });

  it('só reconhece APROVADO como conclusão da substituição', () => {
    expect(concluiSubstituicao('APROVADO')).toBe(true);
    expect(concluiSubstituicao('AGUARDANDO_APROVACAO')).toBe(false);
    expect(concluiSubstituicao('SUBSTITUTO_ACEITO')).toBe(false);
  });

  it('reconhece os estados que ocupam o plantão', () => {
    expect(estaEmAberto('SOLICITADO')).toBe(true);
    expect(estaEmAberto('AGUARDANDO_APROVACAO')).toBe(true);
    expect(estaEmAberto('APROVADO')).toBe(false);
    expect(estaEmAberto('RECUSADO_INSTITUICAO')).toBe(false);
  });
});

describe('máquina de estados do plantão (ADR-020)', () => {
  it('segue o ciclo do §7.3', () => {
    expect(plantaoPodeTransicionar('ABERTO', 'EM_SELECAO')).toBe(true);
    expect(plantaoPodeTransicionar('EM_SELECAO', 'CONFIRMADO')).toBe(true);
    expect(plantaoPodeTransicionar('CONFIRMADO', 'EM_EXECUCAO')).toBe(true);
    expect(plantaoPodeTransicionar('EM_EXECUCAO', 'EXECUTADO')).toBe(true);
    expect(plantaoPodeTransicionar('EXECUTADO', 'LIQUIDADO')).toBe(true);
  });

  it('devolve o plantão a CONFIRMADO depois do repasse', () => {
    expect(plantaoPodeTransicionar('CONFIRMADO', 'EM_REPASSE')).toBe(true);
    expect(plantaoPodeTransicionar('EM_REPASSE', 'CONFIRMADO')).toBe(true);
  });

  it('libera a vaga quando o convite expira', () => {
    expect(plantaoPodeTransicionar('EM_SELECAO', 'ABERTO')).toBe(true);
  });

  it('tira CONTESTADO do beco sem saída', () => {
    // No diagrama original CONTESTADO não tinha saída, o que conflitava com a
    // RN04: um plantão travado nunca liquida nem cancela.
    expect(ehTerminal('CONTESTADO')).toBe(false);
    expect(plantaoPodeTransicionar('CONTESTADO', 'EXECUTADO')).toBe(true);
    expect(plantaoPodeTransicionar('CONTESTADO', 'CANCELADO')).toBe(true);
  });

  it('não permite liquidar sem executar', () => {
    expect(plantaoPodeTransicionar('CONFIRMADO', 'LIQUIDADO')).toBe(false);
    expect(plantaoPodeTransicionar('EM_EXECUCAO', 'LIQUIDADO')).toBe(false);
  });

  it('não repassa plantão que não está confirmado', () => {
    const naoRepassaveis: readonly StatusPlantao[] = [
      'ABERTO',
      'EM_SELECAO',
      'EM_REPASSE',
      'EM_EXECUCAO',
      'EXECUTADO',
      'LIQUIDADO',
      'CONTESTADO',
      'CANCELADO',
    ];
    for (const status of naoRepassaveis) {
      expect(aceitaRepasse(status)).toBe(false);
    }
    expect(aceitaRepasse('CONFIRMADO')).toBe(true);
  });

  it('trata LIQUIDADO e CANCELADO como terminais', () => {
    expect(ehTerminal('LIQUIDADO')).toBe(true);
    expect(ehTerminal('CANCELADO')).toBe(true);
  });
});
