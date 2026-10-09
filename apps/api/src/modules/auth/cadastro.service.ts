import { Injectable } from '@nestjs/common';
import type { CadastroRequest } from '@medescala/contracts';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  EmailJaCadastradoError,
  InstituicaoJaCadastradaError,
  MedicoJaCadastradoError,
} from '../../shared/errors/dominio-negocio.error';
import { SupabaseAuthService } from './supabase-auth.service';

/**
 * Cadastro aberto — PROVISÓRIO (DEC-059).
 *
 * O produto deve virar multi-tenant, com o operador da plataforma incluindo a
 * instituição. Até lá, qualquer pessoa cria conta, com duas travas:
 *
 * - médico nasce NÃO VERIFICADO e não entra em escala até o operador conferir o
 *   CRM (RN02);
 * - instituição nasce PENDENTE e não publica vaga nem enxerga médicos até o
 *   operador confirmar o CNPJ (DEC-063). Quem a cria recebe ADMIN e CHEFIA
 *   (DEC-064).
 *
 * A credencial mora no Supabase Auth e o resto no Postgres do domínio — são dois
 * sistemas, sem transação entre eles. Se o lado do domínio falhar, a credencial
 * é removida (compensação), para não sobrar conta que entra mas não existe.
 */
@Injectable()
export class CadastroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseAuthService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async cadastrar(dados: CadastroRequest): Promise<void> {
    // Conferências baratas ANTES de criar a credencial: evitam a compensação no
    // caso mais comum de erro.
    if ((await this.prisma.usuario.findUnique({ where: { email: dados.email } })) !== null) {
      throw new EmailJaCadastradoError();
    }

    if (dados.tipo === 'MEDICO') {
      const crm = await this.prisma.medico.findUnique({
        where: { crm_crmUf: { crm: dados.crm, crmUf: dados.crmUf } },
      });
      if (crm !== null) {
        throw new MedicoJaCadastradoError(`O CRM ${dados.crm}/${dados.crmUf} já está cadastrado`);
      }
    } else if (
      (await this.prisma.instituicao.findUnique({ where: { cnpj: dados.cnpj } })) !== null
    ) {
      throw new InstituicaoJaCadastradaError();
    }

    const usuarioId = await this.supabase.criarCredencial(dados.email, dados.senha);

    if (usuarioId === null) {
      throw new EmailJaCadastradoError();
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.usuario.create({ data: { id: usuarioId, email: dados.email, nome: dados.nome } });

        if (dados.tipo === 'MEDICO') {
          const medico = await tx.medico.create({
            data: {
              usuarioId,
              crm: dados.crm,
              crmUf: dados.crmUf,
              especialidade: dados.especialidade,
            },
          });

          // Perfil de médico não pertence a uma instituição: é da plataforma.
          await tx.perfilAcesso.create({
            data: { usuarioId, instituicaoId: null, perfil: 'MEDICO' },
          });

          await this.auditoria.registrar(
            {
              acao: 'MEDICO_CADASTRADO',
              entidade: 'Medico',
              entidadeId: medico.id,
              atorId: usuarioId,
              estadoNovo: 'NAO_VERIFICADO',
              payload: { crm: dados.crm, crmUf: dados.crmUf, origem: 'cadastro_aberto' },
            },
            tx,
          );
          return;
        }

        const instituicao = await tx.instituicao.create({
          data: { nome: dados.instituicaoNome, cnpj: dados.cnpj },
        });

        await tx.perfilAcesso.createMany({
          data: [
            { usuarioId, instituicaoId: instituicao.id, perfil: 'ADMIN_INSTITUICAO' },
            { usuarioId, instituicaoId: instituicao.id, perfil: 'CHEFIA_ESCALA' },
          ],
        });

        await this.auditoria.registrar(
          {
            acao: 'INSTITUICAO_CADASTRADA',
            entidade: 'Instituicao',
            entidadeId: instituicao.id,
            atorId: usuarioId,
            estadoNovo: 'PENDENTE',
            payload: { origem: 'cadastro_aberto' },
          },
          tx,
        );
      });
    } catch (erro) {
      await this.supabase.removerCredencial(usuarioId);
      throw erro;
    }
  }
}
