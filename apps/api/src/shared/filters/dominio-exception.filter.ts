import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { ErroApi } from '@medescala/contracts';
import { ErroDominio } from '../errors/dominio.error';

/**
 * Único lugar do sistema que conhece a correspondência entre erro de domínio e
 * status HTTP (§12).
 *
 * Erro de domínio novo sem entrada aqui vira 500 de propósito: a ausência aparece
 * no teste em vez de virar um 200 silencioso com corpo errado.
 */
const STATUS_POR_CODIGO: Readonly<Record<string, number>> = {
  ENTRADA_INVALIDA: HttpStatus.BAD_REQUEST,

  CREDENCIAIS_INVALIDAS: HttpStatus.UNAUTHORIZED,
  NAO_AUTENTICADO: HttpStatus.UNAUTHORIZED,
  SESSAO_EXPIRADA: HttpStatus.UNAUTHORIZED,
  REFRESH_TOKEN_INVALIDO: HttpStatus.UNAUTHORIZED,

  PERFIL_INSUFICIENTE: HttpStatus.FORBIDDEN,
  CSRF_INVALIDO: HttpStatus.FORBIDDEN,
  ORIGEM_NAO_PERMITIDA: HttpStatus.FORBIDDEN,

  // --- Sprints 1-3 -----------------------------------------------------------
  MEDICO_NAO_ENCONTRADO: HttpStatus.NOT_FOUND,
  PLANTAO_NAO_ENCONTRADO: HttpStatus.NOT_FOUND,
  SETOR_NAO_ENCONTRADO: HttpStatus.NOT_FOUND,
  REPASSE_NAO_ENCONTRADO: HttpStatus.NOT_FOUND,

  // 409: o pedido esta bem formado, mas conflita com o estado atual do recurso.
  MEDICO_JA_CADASTRADO: HttpStatus.CONFLICT,
  SOBREPOSICAO_DE_AGENDA: HttpStatus.CONFLICT,
  REPASSE_JA_EM_ABERTO: HttpStatus.CONFLICT,
  TRANSICAO_INVALIDA: HttpStatus.CONFLICT,
  PLANTAO_NAO_REPASSAVEL: HttpStatus.CONFLICT,
  PRAZO_DE_RESPOSTA_EXPIRADO: HttpStatus.CONFLICT,

  // 422: entrada valida sintaticamente, recusada por regra de negocio.
  ANTECEDENCIA_INSUFICIENTE: HttpStatus.UNPROCESSABLE_ENTITY,
  REQUISITOS_NAO_ATENDIDOS: HttpStatus.UNPROCESSABLE_ENTITY,
  MEDICO_NAO_VERIFICADO: HttpStatus.UNPROCESSABLE_ENTITY,
  REPASSE_NAO_APROVADO: HttpStatus.UNPROCESSABLE_ENTITY,

  NAO_EH_TITULAR: HttpStatus.FORBIDDEN,

  // --- cadastro aberto e verificacao -----------------------------------------
  EMAIL_JA_CADASTRADO: HttpStatus.CONFLICT,
  INSTITUICAO_JA_CADASTRADA: HttpStatus.CONFLICT,
  INSTITUICAO_NAO_ENCONTRADA: HttpStatus.NOT_FOUND,
  INSTITUICAO_PENDENTE: HttpStatus.FORBIDDEN,
  USUARIO_NAO_ENCONTRADO: HttpStatus.NOT_FOUND,
  DISPONIBILIDADE_NAO_ENCONTRADA: HttpStatus.NOT_FOUND,
  RECURSO_NAO_ENCONTRADO: HttpStatus.NOT_FOUND,

  // --- fila de convites ------------------------------------------------------
  NAO_EH_CONVIDADO_DA_VEZ: HttpStatus.CONFLICT,
  INDICACAO_INVALIDA: HttpStatus.UNPROCESSABLE_ENTITY,
  MEDICO_NAO_ENCONTRADO_POR_CRM: HttpStatus.NOT_FOUND,
  FORA_DO_ESCOPO_DA_INSTITUICAO: HttpStatus.FORBIDDEN,

  // --- execução do plantão (F16) ---------------------------------------------
  FORA_DA_JANELA_DE_EXECUCAO: HttpStatus.CONFLICT,
  PRAZO_DE_CONTESTACAO_ENCERRADO: HttpStatus.CONFLICT,
  REPASSE_EM_ANDAMENTO: HttpStatus.CONFLICT,
  CONTESTACAO_JA_RESPONDIDA: HttpStatus.CONFLICT,

  // --- vaga aberta (F10) -------------------------------------------------------
  VAGA_NAO_ABERTA: HttpStatus.CONFLICT,
  CANDIDATURA_NAO_ENCONTRADA: HttpStatus.NOT_FOUND,
  CANDIDATURA_JA_RESPONDIDA: HttpStatus.CONFLICT,

  // --- pagamento e nota fiscal (F14, F15, F17) ----------------------------------
  DOCUMENTO_FISCAL_NAO_EMISSIVEL: HttpStatus.CONFLICT,
  SUBCONTRATACAO_NAO_PERMITIDA: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(ErroDominio)
export class DominioExceptionFilter implements ExceptionFilter<ErroDominio> {
  private readonly logger = new Logger(DominioExceptionFilter.name);

  catch(erro: ErroDominio, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>();
    const status = STATUS_POR_CODIGO[erro.codigo] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Erro de domínio sem status mapeado: ${erro.codigo} (${erro.name}). ` +
          'Adicione a entrada em STATUS_POR_CODIGO.',
        erro.stack,
      );
    }

    const corpo: ErroApi = {
      codigo: erro.codigo,
      mensagem: erro.message,
      ...(erro.detalhes === undefined ? {} : { detalhes: erro.detalhes }),
    };

    resposta.status(status).json(corpo);
  }
}
