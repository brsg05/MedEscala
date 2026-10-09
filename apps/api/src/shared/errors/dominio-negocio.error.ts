import { ErroDominio } from './dominio.error';

/**
 * Erros das regras de negócio da Entrega 1.
 *
 * Cada classe aponta a regra que a origina. Nenhuma conhece código HTTP: o
 * `DominioExceptionFilter` traduz por `codigo` (§12).
 */

// --- credenciamento (F01, F02, RN02) -----------------------------------------

export class MedicoNaoEncontradoError extends ErroDominio {
  readonly codigo = 'MEDICO_NAO_ENCONTRADO';

  constructor() {
    super('Nenhum cadastro de médico encontrado para este usuário');
  }
}

export class MedicoJaCadastradoError extends ErroDominio {
  readonly codigo = 'MEDICO_JA_CADASTRADO';

  constructor(detalhe: string) {
    super(detalhe);
  }
}

/**
 * RN02 — "nenhuma candidatura é aceita de médico com CRM irregular".
 *
 * No MVP a regularidade é o campo `verificado`, preenchido por conferência
 * manual do operador da plataforma, porque o CFM não expõe API pública.
 */
export class MedicoNaoVerificadoError extends ErroDominio {
  readonly codigo = 'MEDICO_NAO_VERIFICADO';

  constructor() {
    super('Seu CRM ainda não foi verificado pela plataforma');
  }
}

/** RN02, segunda metade — requisitos obrigatórios da vaga. */
export class RequisitosNaoAtendidosError extends ErroDominio {
  readonly codigo = 'REQUISITOS_NAO_ATENDIDOS';

  constructor(faltantes: readonly string[]) {
    super('O médico não atende aos requisitos obrigatórios da vaga', { faltantes });
  }
}

// --- escala e agenda (F05, F06, RN03) ----------------------------------------

export class PlantaoNaoEncontradoError extends ErroDominio {
  readonly codigo = 'PLANTAO_NAO_ENCONTRADO';

  constructor() {
    super('Plantão não encontrado');
  }
}

export class SetorNaoEncontradoError extends ErroDominio {
  readonly codigo = 'SETOR_NAO_ENCONTRADO';

  constructor() {
    super('Setor não encontrado');
  }
}

/** RN03 — bloqueio de sobreposição. */
export class SobreposicaoDeAgendaError extends ErroDominio {
  readonly codigo = 'SOBREPOSICAO_DE_AGENDA';

  constructor(conflitoId?: string) {
    super(
      'O médico já tem plantão que se sobrepõe a este horário',
      conflitoId === undefined ? undefined : { plantaoConflitanteId: conflitoId },
    );
  }
}

export class TransicaoInvalidaError extends ErroDominio {
  readonly codigo = 'TRANSICAO_INVALIDA';

  constructor(entidade: string, de: string, para: string) {
    super(`${entidade} não pode ir de ${de} para ${para}`, { de, para });
  }
}

// --- repasse (F07, F11, RN01) ------------------------------------------------

export class RepasseNaoEncontradoError extends ErroDominio {
  readonly codigo = 'REPASSE_NAO_ENCONTRADO';

  constructor() {
    super('Repasse não encontrado');
  }
}

/**
 * RN01 — a regra central do produto.
 *
 * O §12 do guia cita esta classe pelo nome como exemplo de erro de domínio. Ela
 * é lançada quando algum caminho tenta concluir a substituição sem a aprovação
 * expressa da instituição.
 */
export class RepasseNaoAprovadoError extends ErroDominio {
  readonly codigo = 'REPASSE_NAO_APROVADO';

  constructor() {
    super(
      'A substituição só se conclui com aprovação da instituição. ' +
        'Até lá, o médico titular segue responsável pelo plantão',
    );
  }
}

export class RepasseJaEmAbertoError extends ErroDominio {
  readonly codigo = 'REPASSE_JA_EM_ABERTO';

  constructor() {
    super('Este plantão já tem um pedido de repasse em andamento');
  }
}

/** F07 — "prazo > mínimo", com o valor configurado pela instituição (RN08). */
export class AntecedenciaInsuficienteError extends ErroDominio {
  readonly codigo = 'ANTECEDENCIA_INSUFICIENTE';

  constructor(horasMinimas: number) {
    super(`O repasse precisa ser pedido com pelo menos ${String(horasMinimas)}h de antecedência`, {
      horasMinimas,
    });
  }
}

/** F10 — convite não respondido no prazo libera a vaga. */
export class PrazoDeRespostaExpiradoError extends ErroDominio {
  readonly codigo = 'PRAZO_DE_RESPOSTA_EXPIRADO';

  constructor() {
    super('O prazo para responder a este convite já expirou');
  }
}

export class PlantaoNaoRepassavelError extends ErroDominio {
  readonly codigo = 'PLANTAO_NAO_REPASSAVEL';

  constructor(status: string) {
    super(`Só plantão confirmado pode ser repassado (situação atual: ${status})`, { status });
  }
}

export class NaoEhTitularError extends ErroDominio {
  readonly codigo = 'NAO_EH_TITULAR';

  constructor() {
    super('Só o médico responsável pelo plantão pode pedir o repasse');
  }
}

// --- escopo institucional (ADR-006) ------------------------------------------

/**
 * O `PerfisGuard` verifica o PERFIL; a qual instituição um recurso pertence só o
 * serviço do módulo sabe. Este erro cobre esse segundo nível.
 */
export class ForaDoEscopoDaInstituicaoError extends ErroDominio {
  readonly codigo = 'FORA_DO_ESCOPO_DA_INSTITUICAO';

  constructor() {
    super('Você não tem perfil nesta instituição para executar esta operação');
  }
}

// --- cadastro aberto, verificação e acesso (DEC-059 a DEC-064) ---------------

export class EmailJaCadastradoError extends ErroDominio {
  readonly codigo = 'EMAIL_JA_CADASTRADO';

  constructor() {
    super('Já existe uma conta com este e-mail');
  }
}

export class InstituicaoJaCadastradaError extends ErroDominio {
  readonly codigo = 'INSTITUICAO_JA_CADASTRADA';

  constructor() {
    super('Este CNPJ já está cadastrado na plataforma');
  }
}

export class InstituicaoNaoEncontradaError extends ErroDominio {
  readonly codigo = 'INSTITUICAO_NAO_ENCONTRADA';

  constructor() {
    super('Instituição não encontrada');
  }
}

/**
 * DEC-063 — instituição recém-cadastrada não publica vaga nem enxerga médicos
 * antes de o operador da plataforma confirmar o CNPJ.
 */
export class InstituicaoPendenteError extends ErroDominio {
  readonly codigo = 'INSTITUICAO_PENDENTE';

  constructor() {
    super('A instituição ainda aguarda a verificação do CNPJ pela plataforma');
  }
}

export class UsuarioNaoEncontradoError extends ErroDominio {
  readonly codigo = 'USUARIO_NAO_ENCONTRADO';

  constructor() {
    super('Nenhuma conta encontrada com este e-mail. A pessoa precisa se cadastrar antes');
  }
}

export class DisponibilidadeNaoEncontradaError extends ErroDominio {
  readonly codigo = 'DISPONIBILIDADE_NAO_ENCONTRADA';

  constructor() {
    super('Janela de disponibilidade não encontrada');
  }
}

/**
 * Leitura de plantão, repasse ou trilha por quem não participa dele.
 *
 * Devolve 404, e não 403, de propósito: responder "existe, mas você não pode
 * ver" já confirma a existência do recurso para quem está sondando ids.
 */
export class SemAcessoAoRecursoError extends ErroDominio {
  readonly codigo = 'RECURSO_NAO_ENCONTRADO';

  constructor() {
    super('Recurso não encontrado');
  }
}

// --- fila de convites do repasse (DEC-087 a DEC-099) --------------------------

/** Só o convidado da vez responde ao convite (DEC-089). */
export class NaoEhConvidadoDaVezError extends ErroDominio {
  readonly codigo = 'NAO_EH_CONVIDADO_DA_VEZ';

  constructor() {
    super(
      'Você não é o convidado da vez neste repasse — o convite pode ter vencido ou passado a outra pessoa',
    );
  }
}

export class IndicacaoInvalidaError extends ErroDominio {
  readonly codigo = 'INDICACAO_INVALIDA';

  constructor(motivo: string) {
    super(motivo);
  }
}

export class MedicoNaoEncontradoPorCrmError extends ErroDominio {
  readonly codigo = 'MEDICO_NAO_ENCONTRADO_POR_CRM';

  constructor() {
    // Não diz se o CRM existe mas não foi verificado: só médicos verificados podem
    // ser indicados, e distinguir os dois casos vazaria quem está em conferência.
    super('Nenhum médico verificado com este CRM');
  }
}

// --- execução do plantão (F16, DEC-130 a DEC-134) ------------------------------

/** Check-in ou check-out fora do horário permitido (DEC-133). */
export class ForaDaJanelaDeExecucaoError extends ErroDominio {
  readonly codigo = 'FORA_DA_JANELA_DE_EXECUCAO';

  constructor(motivo: string) {
    super(motivo);
  }
}

export class PrazoDeContestacaoEncerradoError extends ErroDominio {
  readonly codigo = 'PRAZO_DE_CONTESTACAO_ENCERRADO';

  constructor() {
    super('O prazo para contestar este plantão já terminou');
  }
}

/** O plantão tem repasse em curso: quem vai executá-lo ainda não está decidido. */
export class RepasseEmAndamentoError extends ErroDominio {
  readonly codigo = 'REPASSE_EM_ANDAMENTO';

  constructor() {
    super(
      'Há um pedido de repasse em andamento para este plantão. Cancele-o ou aguarde a decisão da instituição.',
    );
  }
}

export class ContestacaoJaRespondidaError extends ErroDominio {
  readonly codigo = 'CONTESTACAO_JA_RESPONDIDA';

  constructor() {
    super('Esta contestação já foi respondida');
  }
}
