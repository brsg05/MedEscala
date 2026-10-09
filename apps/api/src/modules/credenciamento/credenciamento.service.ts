import { Injectable } from '@nestjs/common';
import type {
  CandidatoResponse,
  PendenciasResponse,
  CriarDisponibilidadeRequest,
  CriarMedicoRequest,
  DadosFiscaisRequest,
  DisponibilidadeResponse,
  MedicoResponse,
} from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  MedicoNaoEncontradoPorCrmError,
  DisponibilidadeNaoEncontradaError,
  MedicoJaCadastradoError,
  MedicoNaoEncontradoError,
} from '../../shared/errors/dominio-negocio.error';

/**
 * F01, F02 e F04 — quem é o profissional e quando ele pode trabalhar.
 *
 * O módulo é dono de `Medico` e `JanelaDisponibilidade`; nenhum outro módulo
 * toca essas tabelas direto (§6 do guia: "módulo não importa repositório de
 * outro módulo — se precisar, importa o service").
 */
@Injectable()
export class CredenciamentoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async cadastrar(usuarioId: string, dados: CriarMedicoRequest): Promise<MedicoResponse> {
    const jaTem = await this.prisma.medico.findUnique({ where: { usuarioId } });

    if (jaTem !== null) {
      throw new MedicoJaCadastradoError('Este usuário já tem cadastro de médico');
    }

    const crmOcupado = await this.prisma.medico.findUnique({
      where: { crm_crmUf: { crm: dados.crm, crmUf: dados.crmUf } },
    });

    if (crmOcupado !== null) {
      throw new MedicoJaCadastradoError(
        `O CRM ${dados.crm}/${dados.crmUf} já está cadastrado na plataforma`,
      );
    }

    const medico = await this.prisma.medico.create({
      data: { usuarioId, crm: dados.crm, crmUf: dados.crmUf, especialidade: dados.especialidade },
      include: { usuario: { select: { nome: true } } },
    });

    await this.auditoria.registrar({
      acao: 'MEDICO_CADASTRADO',
      entidade: 'Medico',
      entidadeId: medico.id,
      atorId: usuarioId,
      estadoNovo: 'NAO_VERIFICADO',
      payload: { crm: medico.crm, crmUf: medico.crmUf },
    });

    return this.paraResposta(medico);
  }

  async meuCadastro(usuarioId: string): Promise<MedicoResponse> {
    const medico = await this.prisma.medico.findUnique({
      where: { usuarioId },
      include: { usuario: { select: { nome: true } } },
    });

    if (medico === null) {
      throw new MedicoNaoEncontradoError();
    }

    return this.paraResposta(medico);
  }

  /** F02 — dados fiscais. Alimentam o cálculo de retenções do Sprint 4. */
  async atualizarDadosFiscais(
    usuarioId: string,
    dados: DadosFiscaisRequest,
  ): Promise<MedicoResponse> {
    const medico = await this.exigirMedico(usuarioId);

    const atualizado = await this.prisma.medico.update({
      where: { id: medico.id },
      data: {
        cnpj: dados.cnpj,
        regimeTributario: dados.regimeTributario,
        inscricaoMunicipal: dados.inscricaoMunicipal,
      },
      include: { usuario: { select: { nome: true } } },
    });

    await this.auditoria.registrar({
      acao: 'DADOS_FISCAIS_ATUALIZADOS',
      entidade: 'Medico',
      entidadeId: medico.id,
      atorId: usuarioId,
      // O CNPJ em si não vai para a trilha: ela é consultável e não precisa
      // replicar dado cadastral (minimização, RNF06).
      payload: { temCnpj: dados.cnpj !== null, regime: dados.regimeTributario },
    });

    return this.paraResposta(atualizado);
  }

  /** F04 — declarar disponibilidade. */
  async declararDisponibilidade(
    usuarioId: string,
    dados: CriarDisponibilidadeRequest,
  ): Promise<DisponibilidadeResponse> {
    const medico = await this.exigirMedico(usuarioId);

    const janela = await this.prisma.janelaDisponibilidade.create({
      data: {
        medicoId: medico.id,
        inicio: new Date(dados.inicio),
        fim: new Date(dados.fim),
        valorMinimoCentavos: dados.valorMinimoCentavos,
      },
    });

    return {
      id: janela.id,
      inicio: janela.inicio.toISOString(),
      fim: janela.fim.toISOString(),
      valorMinimoCentavos: janela.valorMinimoCentavos,
    };
  }

  async listarDisponibilidades(usuarioId: string): Promise<DisponibilidadeResponse[]> {
    const medico = await this.exigirMedico(usuarioId);

    const janelas = await this.prisma.janelaDisponibilidade.findMany({
      where: { medicoId: medico.id },
      orderBy: { inicio: 'asc' },
    });

    return janelas.map((j) => ({
      id: j.id,
      inicio: j.inicio.toISOString(),
      fim: j.fim.toISOString(),
      valorMinimoCentavos: j.valorMinimoCentavos,
    }));
  }

  /**
   * Retira uma janela de disponibilidade.
   *
   * Como a chefia só enxerga quem se ofereceu (DEC-062), retirar a janela é
   * também retirar-se da busca daquele horário — o médico controla a própria
   * exposição.
   */
  async removerDisponibilidade(usuarioId: string, janelaId: string): Promise<void> {
    const medico = await this.exigirMedico(usuarioId);

    const { count } = await this.prisma.janelaDisponibilidade.deleteMany({
      where: { id: janelaId, medicoId: medico.id },
    });

    if (count === 0) {
      throw new DisponibilidadeNaoEncontradaError();
    }
  }

  /**
   * DEC-091 — apontamento individual por CRM + UF EXATO: devolve no máximo uma
   * pessoa, e só verificada. Busca por nome foi descartada porque permitiria
   * colher a base de médicos aos poucos.
   */
  async buscarPorCrm(crm: string, crmUf: string): Promise<CandidatoResponse> {
    const medico = await this.prisma.medico.findUnique({
      where: { crm_crmUf: { crm, crmUf } },
      include: { usuario: { select: { nome: true } } },
    });

    if (medico === null || !medico.verificado) {
      throw new MedicoNaoEncontradoPorCrmError();
    }

    return {
      id: medico.id,
      nome: medico.usuario.nome,
      crm: medico.crm,
      crmUf: medico.crmUf,
      especialidade: medico.especialidade,
    };
  }

  /** RN02 — médicos esperando conferência de CRM pelo operador. */
  async naoVerificados(): Promise<PendenciasResponse['medicos']> {
    const medicos = await this.prisma.medico.findMany({
      where: { verificado: false },
      include: { usuario: { select: { nome: true, email: true } } },
      orderBy: { criadoEm: 'asc' },
    });

    return medicos.map((m) => ({
      id: m.id,
      nome: m.usuario.nome,
      email: m.usuario.email,
      crm: m.crm,
      crmUf: m.crmUf,
      especialidade: m.especialidade,
      criadoEm: m.criadoEm.toISOString(),
    }));
  }

  /**
   * RN02 — o operador atesta a regularidade do CRM.
   *
   * O CFM não tem API pública (§3.1), então a conferência é feita por pessoa, fora
   * do sistema, e registrada aqui com quem atestou e quando.
   */
  async verificar(medicoId: string, operadorId: string): Promise<void> {
    const medico = await this.prisma.medico.findUnique({ where: { id: medicoId } });

    if (medico === null) {
      throw new MedicoNaoEncontradoError();
    }

    if (medico.verificado) {
      return;
    }

    await this.prisma.medico.update({
      where: { id: medicoId },
      data: { verificado: true, verificadoEm: new Date(), verificadoPorId: operadorId },
    });

    await this.auditoria.registrar({
      acao: 'CRM_VERIFICADO',
      entidade: 'Medico',
      entidadeId: medicoId,
      atorId: operadorId,
      atorPerfil: 'OPERADOR_PLATAFORMA',
      estadoAnterior: 'NAO_VERIFICADO',
      estadoNovo: 'VERIFICADO',
    });
  }

  /**
   * Usado por outros módulos (escala, repasse) para resolver o médico a partir
   * do usuário autenticado — é a interface pública deste módulo.
   */
  async exigirMedico(usuarioId: string): Promise<{ id: string; verificado: boolean }> {
    const medico = await this.prisma.medico.findUnique({
      where: { usuarioId },
      select: { id: true, verificado: true },
    });

    if (medico === null) {
      throw new MedicoNaoEncontradoError();
    }

    return medico;
  }

  private paraResposta(medico: {
    id: string;
    crm: string;
    crmUf: string;
    especialidade: string;
    verificado: boolean;
    cnpj: string | null;
    regimeTributario: MedicoResponse['regimeTributario'];
    inscricaoMunicipal: string | null;
    usuario: { nome: string };
  }): MedicoResponse {
    return {
      id: medico.id,
      nome: medico.usuario.nome,
      crm: medico.crm,
      crmUf: medico.crmUf,
      especialidade: medico.especialidade,
      verificado: medico.verificado,
      cnpj: medico.cnpj,
      regimeTributario: medico.regimeTributario,
      inscricaoMunicipal: medico.inscricaoMunicipal,
    };
  }
}
