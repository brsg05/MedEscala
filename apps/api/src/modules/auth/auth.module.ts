import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CadastroService } from './cadastro.service';
import { PerfilAcessoService } from './perfil-acesso.service';
import { RefreshTokenService } from './refresh-token.service';
import { SupabaseAuthService } from './supabase-auth.service';

/**
 * Módulo `auth` — lacuna do §6 do guia, que lista os módulos de domínio mas não
 * este, embora o §9 exponha `/auth/login` e `/auth/refresh` (ver ADR-016).
 *
 * Fronteira: `credenciamento` cuida de QUEM a pessoa é (CRM, documentos, dados
 * fiscais); `auth` cuida de COMO ela prova isso.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    CadastroService,
    SupabaseAuthService,
    RefreshTokenService,
    PerfilAcessoService,
  ],
  exports: [SupabaseAuthService, PerfilAcessoService],
})
export class AuthModule {}
