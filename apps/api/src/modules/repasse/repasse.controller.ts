import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  AbrirRepasseRequest,
  IndicarSubstitutosRequest,
  RecusarRepasseRequest,
  type CandidatoResponse,
  type ConviteResponse,
  type DecisaoResponse,
  type RepasseComPlantao,
  type RepasseResponse,
  type UsuarioAutenticado,
} from '@medescala/contracts';
import { ZodValidationPipe } from '../../shared/validacao/zod-validation.pipe';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { CredenciamentoService } from '../credenciamento/credenciamento.service';
import { instituicoesCom } from '../escala/escala.controller';
import { InstituicaoService } from '../escala/instituicao.service';
import {
  SemAcessoAoRecursoError,
  NaoEhTitularError,
} from '../../shared/errors/dominio-negocio.error';
import { EscalaService } from '../escala/escala.service';
import { FilaDeConvitesService } from './fila-de-convites.service';
import { ListagemDeRepassesService } from './listagem.service';
import { RepasseService } from './repasse.service';

@Controller()
export class RepasseController {
  constructor(
    private readonly repasse: RepasseService,
    private readonly listagem: ListagemDeRepassesService,
    private readonly credenciamento: CredenciamentoService,
    private readonly instituicao: InstituicaoService,
    private readonly fila: FilaDeConvitesService,
    private readonly escala: EscalaService,
  ) {}

  /**
   * O que espera decisão do usuário autenticado.
   *
   * DEC-055: o perfil da sessão decide o que pode aparecer. Os parâmetros
   * `modo=medico` e `instituicaoId` só RECORTAM esse conjunto para a tela do
   * modo ativo (DEC-061) — nunca o ampliam: uma instituição em que o usuário não
   * é chefia simplesmente não entra no filtro (DEC-067).
   */
  @Get('decisoes')
  async decisoes(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('modo') modo?: string,
    @Query('instituicaoId') instituicaoId?: string,
  ): Promise<DecisaoResponse[]> {
    const escopo = await this.escopo(usuario, modo, instituicaoId);
    return this.listagem.decisoesPendentes(escopo.medicoId, escopo.instituicoes);
  }

  /** Repasses em que o usuário aparece, recortados pelo modo ativo. */
  @Get('repasses')
  async listar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('modo') modo?: string,
    @Query('instituicaoId') instituicaoId?: string,
  ): Promise<RepasseComPlantao[]> {
    const escopo = await this.escopo(usuario, modo, instituicaoId);
    return this.listagem.meusRepasses(escopo.medicoId, escopo.instituicoes);
  }

  /** F07 — abrir pedido de repasse. */
  @Perfis('MEDICO')
  @Post('plantoes/:id/repasses')
  async abrir(
    @Param('id', ParseUUIDPipe) plantaoId: string,
    @Body(new ZodValidationPipe(AbrirRepasseRequest)) corpo: AbrirRepasseRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RepasseResponse> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    return this.repasse.abrir(plantaoId, medico.id, corpo);
  }

  /** F10 — o substituto aceita cobrir o plantão. */
  @Perfis('MEDICO')
  @Post('repasses/:id/aceitar')
  @HttpCode(HttpStatus.OK)
  async aceitar(
    @Param('id', ParseUUIDPipe) repasseId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RepasseResponse> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    return this.repasse.aceitar(repasseId, medico.id);
  }

  /**
   * F11 — aprovação da chefia. Etapa **bloqueante**: é o único caminho pelo qual
   * o executante do plantão muda (RN01).
   */
  @Perfis('CHEFIA_ESCALA')
  @Post('repasses/:id/aprovar')
  @HttpCode(HttpStatus.OK)
  async aprovar(
    @Param('id', ParseUUIDPipe) repasseId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RepasseResponse> {
    return this.repasse.aprovar(repasseId, usuario.id, instituicoesCom(usuario, 'CHEFIA_ESCALA'));
  }

  /** F11 — recusa com justificativa registrada. */
  @Perfis('CHEFIA_ESCALA')
  @Post('repasses/:id/recusar')
  @HttpCode(HttpStatus.OK)
  async recusar(
    @Param('id', ParseUUIDPipe) repasseId: string,
    @Body(new ZodValidationPipe(RecusarRepasseRequest)) corpo: RecusarRepasseRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RepasseResponse> {
    return this.repasse.recusar(
      repasseId,
      usuario.id,
      corpo.justificativa,
      instituicoesCom(usuario, 'CHEFIA_ESCALA'),
    );
  }

  @Get('repasses/:id')
  async buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RepasseResponse> {
    // Leitura também avança a fila vencida (DEC-097).
    await this.fila.avancar(id);
    const repasse = await this.repasse.buscar(id);
    // Antes sem trava: qualquer usuário logado lia qualquer repasse.
    await this.instituicao.exigirLeituraDoPlantao(usuario, repasse.plantaoId);
    return repasse;
  }

  // --- fila de convites (DEC-087 a DEC-099) -----------------------------------

  /**
   * DEC-087, Forma 1 — quem o titular pode indicar da lista: os mesmos que a
   * chefia veria (DEC-062), sem ele mesmo.
   */
  @Perfis('MEDICO')
  @Get('plantoes/:id/substitutos')
  async substitutos(
    @Param('id', ParseUUIDPipe) plantaoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<CandidatoResponse[]> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    const plantao = await this.escala.buscarPlantao(plantaoId);

    if (plantao.medicoExecutanteId !== medico.id) {
      throw new NaoEhTitularError();
    }

    return this.instituicao.elegiveis(plantao, [medico.id]);
  }

  /** O convidado da vez recusa; a fila passa ao próximo. */
  @Perfis('MEDICO')
  @Post('repasses/:id/recusar-convite')
  @HttpCode(HttpStatus.OK)
  async recusarConvite(
    @Param('id', ParseUUIDPipe) repasseId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RepasseResponse> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    return this.repasse.recusarConvite(repasseId, medico.id);
  }

  /** O titular desiste enquanto ninguém aceitou. */
  @Perfis('MEDICO')
  @Post('repasses/:id/cancelar')
  @HttpCode(HttpStatus.OK)
  async cancelar(
    @Param('id', ParseUUIDPipe) repasseId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RepasseResponse> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    return this.repasse.cancelar(repasseId, medico.id);
  }

  /** DEC-096 — com a fila de volta, o titular indica mais gente. */
  @Perfis('MEDICO')
  @Post('repasses/:id/indicar')
  @HttpCode(HttpStatus.OK)
  async indicar(
    @Param('id', ParseUUIDPipe) repasseId: string,
    @Body(new ZodValidationPipe(IndicarSubstitutosRequest)) corpo: IndicarSubstitutosRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RepasseResponse> {
    const medico = await this.credenciamento.exigirMedico(usuario.id);
    return this.repasse.indicar(repasseId, medico.id, corpo.indicados);
  }

  /**
   * A fila inteira — só o titular e a instituição. Os outros convidados não veem
   * quem mais foi chamado nem em que ordem.
   */
  @Get('repasses/:id/fila')
  async filaDoRepasse(
    @Param('id', ParseUUIDPipe) repasseId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ConviteResponse[]> {
    await this.fila.avancar(repasseId);
    const repasse = await this.repasse.buscar(repasseId);
    const plantao = await this.escala.buscarPlantao(repasse.plantaoId);

    const daInstituicao = instituicoesCom(usuario, 'ADMIN_INSTITUICAO', 'CHEFIA_ESCALA').includes(
      plantao.escala.setor.unidade.instituicaoId,
    );
    const medicoId = await this.medicoOuNulo(usuario.id);

    if (!daInstituicao && medicoId !== repasse.titular.id) {
      throw new SemAcessoAoRecursoError();
    }

    return this.repasse.filaDoRepasse(repasseId);
  }

  private async escopo(
    usuario: UsuarioAutenticado,
    modo: string | undefined,
    instituicaoId: string | undefined,
  ): Promise<{ medicoId: string | null; instituicoes: readonly string[] }> {
    const chefia = instituicoesCom(usuario, 'CHEFIA_ESCALA');

    if (modo === 'medico') {
      return { medicoId: await this.medicoOuNulo(usuario.id), instituicoes: [] };
    }

    if (instituicaoId !== undefined) {
      return { medicoId: null, instituicoes: chefia.filter((i) => i === instituicaoId) };
    }

    return { medicoId: await this.medicoOuNulo(usuario.id), instituicoes: chefia };
  }

  /**
   * Nem todo usuario e medico — a chefia, por exemplo, pode nao ter cadastro.
   * Devolver `null` em vez de lancar deixa as listagens funcionarem para os dois.
   */
  private async medicoOuNulo(usuarioId: string): Promise<string | null> {
    try {
      return (await this.credenciamento.exigirMedico(usuarioId)).id;
    } catch {
      return null;
    }
  }
}
