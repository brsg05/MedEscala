import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ConcederChefiaRequest,
  ConfiguracaoInstituicaoRequest,
  CriarPlantaoRequest,
  CriarSetorRequest,
  CriarUnidadeRequest,
  type AgendaResponse,
  type CandidatoResponse,
  type EstruturaResponse,
  type EventoAuditoriaResponse,
  type PlantaoResponse,
  type UsuarioAutenticado,
} from '@medescala/contracts';
import { ZodValidationPipe } from '../../shared/validacao/zod-validation.pipe';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { PerfilAcessoService } from '../auth/perfil-acesso.service';
import { CredenciamentoService } from '../credenciamento/credenciamento.service';
import { EscalaService } from './escala.service';
import {
  type AjustesDaInstituicao,
  InstituicaoService,
  instituicoesComPerfil,
} from './instituicao.service';

/** Mantido com este nome porque outros módulos já o importam. */
export const instituicoesCom = instituicoesComPerfil;

const DIA_MS = 86_400_000;

function intervalo(desde?: string, ate?: string, diasPadrao = 30): { inicio: Date; fim: Date } {
  const inicio = desde === undefined ? new Date() : new Date(desde);
  const fim = ate === undefined ? new Date(inicio.getTime() + diasPadrao * DIA_MS) : new Date(ate);
  return { inicio, fim };
}

@Controller()
export class EscalaController {
  constructor(
    private readonly escala: EscalaService,
    private readonly instituicao: InstituicaoService,
    private readonly credenciamento: CredenciamentoService,
    private readonly perfilAcesso: PerfilAcessoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // --- estrutura da instituição (F03) ------------------------------------------

  @Perfis('ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Get('instituicoes/:id/estrutura')
  async estrutura(
    @Param('id', ParseUUIDPipe) instituicaoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<EstruturaResponse> {
    this.instituicao.exigirPapel(usuario, instituicaoId, 'ADMIN_INSTITUICAO', 'CHEFIA_ESCALA');
    return this.instituicao.estrutura(instituicaoId);
  }

  /**
   * Unidades e setores podem ser criados com a instituição ainda PENDENTE: a
   * estrutura fica pronta enquanto o CNPJ é conferido. O que a verificação trava
   * é publicar vaga e enxergar médicos (DEC-063, DEC-066).
   */
  @Perfis('ADMIN_INSTITUICAO')
  @Post('instituicoes/:id/unidades')
  async criarUnidade(
    @Param('id', ParseUUIDPipe) instituicaoId: string,
    @Body(new ZodValidationPipe(CriarUnidadeRequest)) corpo: CriarUnidadeRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ id: string; nome: string }> {
    this.instituicao.exigirPapel(usuario, instituicaoId, 'ADMIN_INSTITUICAO');
    return this.escala.criarUnidade(instituicaoId, corpo, usuario.id);
  }

  @Perfis('ADMIN_INSTITUICAO')
  @Post('unidades/:id/setores')
  async criarSetor(
    @Param('id', ParseUUIDPipe) unidadeId: string,
    @Body(new ZodValidationPipe(CriarSetorRequest)) corpo: CriarSetorRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ id: string; nome: string }> {
    // Antes não havia esta checagem: qualquer admin criava setor em qualquer
    // unidade de qualquer instituição.
    await this.instituicao.exigirAdminDaUnidade(usuario, unidadeId);
    return this.escala.criarSetor(unidadeId, corpo, usuario.id);
  }

  /** DEC-064 — o admin concede chefia a quem já tem conta. */
  @Perfis('ADMIN_INSTITUICAO')
  @Post('instituicoes/:id/chefias')
  async concederChefia(
    @Param('id', ParseUUIDPipe) instituicaoId: string,
    @Body(new ZodValidationPipe(ConcederChefiaRequest)) corpo: ConcederChefiaRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ usuarioId: string; nome: string; email: string }> {
    this.instituicao.exigirPapel(usuario, instituicaoId, 'ADMIN_INSTITUICAO');
    return this.perfilAcesso.concederChefia(instituicaoId, corpo.email, usuario.id);
  }

  /** DEC-090 e DEC-132 — prazos do convite da fila e da contestação. */
  @Perfis('ADMIN_INSTITUICAO')
  @Patch('instituicoes/:id/configuracao')
  @HttpCode(HttpStatus.NO_CONTENT)
  async configurar(
    @Param('id', ParseUUIDPipe) instituicaoId: string,
    @Body(new ZodValidationPipe(ConfiguracaoInstituicaoRequest))
    corpo: ConfiguracaoInstituicaoRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    this.instituicao.exigirPapel(usuario, instituicaoId, 'ADMIN_INSTITUICAO');
    // `undefined` não entra: só o que o admin mudou vai para a trilha.
    const ajustes = Object.fromEntries(
      Object.entries(corpo).filter(([, v]) => v !== undefined),
    ) as AjustesDaInstituicao;
    await this.instituicao.configurar(instituicaoId, ajustes, usuario.id);
  }

  // --- escala da instituição (F06, F12) ----------------------------------------

  @Perfis('ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Get('instituicoes/:id/plantoes')
  async plantoesDaInstituicao(
    @Param('id', ParseUUIDPipe) instituicaoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('desde') desde?: string,
    @Query('ate') ate?: string,
  ): Promise<PlantaoResponse[]> {
    this.instituicao.exigirPapel(usuario, instituicaoId, 'ADMIN_INSTITUICAO', 'CHEFIA_ESCALA');
    const { inicio, fim } = intervalo(desde, ate);
    return this.instituicao.plantoes(instituicaoId, inicio, fim);
  }

  /** F06 — publicar vaga. Instituição PENDENTE é recusada no serviço (DEC-063). */
  @Perfis('ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Post('plantoes')
  async publicarVaga(
    @Body(new ZodValidationPipe(CriarPlantaoRequest)) corpo: CriarPlantaoRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.escala.publicarVaga(
      corpo,
      usuario.id,
      instituicoesComPerfil(usuario, 'ADMIN_INSTITUICAO', 'CHEFIA_ESCALA'),
    );
  }

  /** DEC-062 — só médicos que se ofereceram para aquele horário. */
  @Perfis('ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Get('plantoes/:id/candidatos')
  async candidatos(
    @Param('id', ParseUUIDPipe) plantaoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<CandidatoResponse[]> {
    const plantao = await this.escala.buscarPlantao(plantaoId);
    this.instituicao.exigirPapel(
      usuario,
      plantao.escala.setor.unidade.instituicaoId,
      'ADMIN_INSTITUICAO',
      'CHEFIA_ESCALA',
    );
    return this.instituicao.candidatos(plantaoId);
  }

  // --- leitura de plantão (com checagem de participação) -----------------------

  @Get('plantoes/:id')
  async buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    await this.instituicao.exigirLeituraDoPlantao(usuario, id);
    return this.escala.paraResposta(await this.escala.buscarPlantao(id));
  }

  /** F23 — a trilha completa do plantão e de seus repasses. */
  @Get('plantoes/:id/auditoria')
  async trilha(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<EventoAuditoriaResponse[]> {
    await this.instituicao.exigirLeituraDoPlantao(usuario, id);
    return this.auditoria.trilhaDoPlantao(id);
  }

  // --- agenda do médico (F05) ---------------------------------------------------

  @Perfis('MEDICO')
  @Get('medicos/me/agenda')
  async minhaAgenda(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('desde') desde?: string,
    @Query('ate') ate?: string,
  ): Promise<AgendaResponse> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    const { inicio, fim } = intervalo(desde, ate);
    return this.escala.agendaDoMedico(medico.id, inicio, fim);
  }
}
