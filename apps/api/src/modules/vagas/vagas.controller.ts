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
  AtribuirPlantaoRequest,
  ConvidarParaVagaRequest,
  VagasQuery,
  type CandidaturaResponse,
  type ConviteResponse,
  type PlantaoResponse,
  type UsuarioAutenticado,
  type VagaResponse,
} from '@medescala/contracts';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../../shared/validacao/zod-validation.pipe';
import { VagasService } from './vagas.service';

/**
 * F10 — rotas da vaga aberta. Do médico: ver vagas, candidatar-se, responder ao
 * convite. Da instituição (admin ou chefia, os mesmos que publicam e escalam):
 * convidar pela fila, escolher candidato, escalar direto.
 */
@Controller()
export class VagasController {
  constructor(private readonly vagas: VagasService) {}

  // --- médico -----------------------------------------------------------------

  @Perfis('MEDICO')
  @Get('vagas')
  async vagasAbertas(
    @Query(new ZodValidationPipe(VagasQuery)) query: VagasQuery,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<VagaResponse[]> {
    return this.vagas.vagasAbertas(usuario, query.todas === 'true');
  }

  @Perfis('MEDICO')
  @Post('plantoes/:id/candidaturas')
  async candidatar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<VagaResponse> {
    return this.vagas.candidatar(id, usuario);
  }

  @Perfis('MEDICO')
  @Post('candidaturas/:id/retirar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async retirar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.vagas.retirarCandidatura(id, usuario);
  }

  @Perfis('MEDICO')
  @Post('plantoes/:id/convite/aceitar')
  async aceitarConvite(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.vagas.aceitarConvite(id, usuario);
  }

  @Perfis('MEDICO')
  @Post('plantoes/:id/convite/recusar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recusarConvite(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.vagas.recusarConvite(id, usuario);
  }

  // --- instituição ------------------------------------------------------------

  @Perfis('ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Post('plantoes/:id/convites')
  async convidar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ConvidarParaVagaRequest)) corpo: ConvidarParaVagaRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.vagas.convidar(id, usuario, corpo.indicados);
  }

  @Perfis('ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Get('plantoes/:id/convites')
  async fila(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ConviteResponse[]> {
    return this.vagas.filaDaVaga(id, usuario);
  }

  @Perfis('ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Post('plantoes/:id/convites/encerrar')
  async encerrar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.vagas.encerrarConvites(id, usuario);
  }

  @Perfis('ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Get('plantoes/:id/candidaturas')
  async candidaturas(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<CandidaturaResponse[]> {
    return this.vagas.candidaturas(id, usuario);
  }

  @Perfis('ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Post('candidaturas/:id/aceitar')
  async aceitarCandidatura(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.vagas.aceitarCandidatura(id, usuario);
  }

  @Perfis('ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Post('candidaturas/:id/recusar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recusarCandidatura(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.vagas.recusarCandidatura(id, usuario);
  }

  /** F12 — escalar direto (DEC-052). Mesma rota de antes da F10. */
  @Perfis('ADMIN_INSTITUICAO', 'CHEFIA_ESCALA')
  @Post('plantoes/:id/atribuir')
  async atribuir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AtribuirPlantaoRequest)) corpo: AtribuirPlantaoRequest,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PlantaoResponse> {
    return this.vagas.escalarDireto(id, corpo.medicoId, usuario);
  }
}
