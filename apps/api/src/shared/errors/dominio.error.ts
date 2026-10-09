/**
 * Erro de domínio (§12 do guia).
 *
 * Regra de negócio NÃO conhece código de status HTTP. Cada erro carrega um
 * `codigo` estável; o `DominioExceptionFilter` é o único lugar que traduz código
 * para status. Isso mantém o domínio testável fora do Nest e permite que o mesmo
 * erro vire 401 numa rota e 403 em outra sem tocar na regra.
 *
 * O `codigo` é contrato com o frontend (ver `ErroApi` em @medescala/contracts):
 * mensagem pode mudar, código não.
 */
export abstract class ErroDominio extends Error {
  abstract readonly codigo: string;

  constructor(
    mensagem: string,
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

// --- Autenticação e sessão -------------------------------------------------

export class CredenciaisInvalidasError extends ErroDominio {
  readonly codigo = 'CREDENCIAIS_INVALIDAS';

  constructor() {
    // Mensagem deliberadamente genérica: distinguir "e-mail não existe" de
    // "senha errada" entrega uma lista de usuários válidos a quem testar.
    super('E-mail ou senha inválidos');
  }
}

export class NaoAutenticadoError extends ErroDominio {
  readonly codigo = 'NAO_AUTENTICADO';

  constructor() {
    super('É necessário estar autenticado para acessar este recurso');
  }
}

export class SessaoExpiradaError extends ErroDominio {
  readonly codigo = 'SESSAO_EXPIRADA';

  constructor() {
    super('Sessão expirada. Faça login novamente');
  }
}

export class RefreshTokenInvalidoError extends ErroDominio {
  readonly codigo = 'REFRESH_TOKEN_INVALIDO';

  constructor(mensagem = 'Refresh token inválido ou já utilizado') {
    super(mensagem);
  }
}

// --- Autorização -----------------------------------------------------------

export class PerfilInsuficienteError extends ErroDominio {
  readonly codigo = 'PERFIL_INSUFICIENTE';

  constructor(exigidos: readonly string[]) {
    super('Seu perfil não permite esta operação', { perfisExigidos: exigidos });
  }
}

// --- Proteção de requisição (D9) -------------------------------------------

export class CsrfInvalidoError extends ErroDominio {
  readonly codigo = 'CSRF_INVALIDO';

  constructor() {
    super('Token CSRF ausente ou divergente');
  }
}

export class OrigemNaoPermitidaError extends ErroDominio {
  readonly codigo = 'ORIGEM_NAO_PERMITIDA';

  constructor(origem: string | undefined) {
    super('Origem da requisição não permitida', { origem: origem ?? null });
  }
}

// --- Entrada ---------------------------------------------------------------

export class EntradaInvalidaError extends ErroDominio {
  readonly codigo = 'ENTRADA_INVALIDA';

  constructor(detalhes: unknown) {
    super('Dados de entrada inválidos', detalhes);
  }
}
