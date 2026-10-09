import type { Request } from 'express';
import type { UsuarioAutenticado } from '@medescala/contracts';

/** Requisição depois do `JwtAuthGuard`: o usuário e seus perfis já resolvidos. */
export interface RequisicaoAutenticada extends Request {
  usuario?: UsuarioAutenticado;
}
