import { z } from 'zod';
import { Perfil } from './perfis.js';

/**
 * Nomes dos cookies e do header de CSRF (D9).
 *
 * Desenho: a sessão (access + refresh) vai em cookie `httpOnly`, inacessível ao JS —
 * imune a XSS. O token de CSRF vai num cookie **legível** pelo JS, que o reenvia no
 * header; a api compara cookie × header (double-submit) e ainda valida `Origin`.
 *
 * Os nomes moram aqui porque o web precisa ler o cookie de CSRF e montar o header, e
 * a api precisa escrever e validar os mesmos nomes.
 */
export const COOKIE_ACCESS_TOKEN = 'medescala_at';
export const COOKIE_REFRESH_TOKEN = 'medescala_rt';
export const COOKIE_CSRF_TOKEN = 'medescala_csrf';
export const HEADER_CSRF_TOKEN = 'x-csrf-token';

/** Tamanho mínimo de senha. Precisa bater com `minimum_password_length` do Supabase. */
export const SENHA_TAMANHO_MINIMO = 8;

export const LoginRequest = z.strictObject({
  email: z.email('E-mail inválido'),
  senha: z
    .string()
    .min(SENHA_TAMANHO_MINIMO, `A senha deve ter ao menos ${SENHA_TAMANHO_MINIMO} caracteres`),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/**
 * Um usuário pode ter perfis diferentes por instituição (§7.1: `Usuario ──< PerfilAcesso
 * >── Instituicao`). `instituicaoId` é nulo para perfil que não tem escopo institucional,
 * como `OPERADOR_PLATAFORMA`.
 */
export const PerfilAtribuido = z.strictObject({
  perfil: Perfil,
  instituicaoId: z.uuid().nullable(),
  instituicaoNome: z.string().nullable(),
});
export type PerfilAtribuido = z.infer<typeof PerfilAtribuido>;

export const UsuarioAutenticado = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  nome: z.string(),
  perfis: z.array(PerfilAtribuido),
});
export type UsuarioAutenticado = z.infer<typeof UsuarioAutenticado>;

/**
 * O corpo da resposta **não carrega token de sessão** — ele vai só no cookie `httpOnly`.
 * O que volta é a identidade e o token de CSRF.
 */
export const LoginResponse = z.strictObject({
  usuario: UsuarioAutenticado,
  csrfToken: z.string().min(1),
});
export type LoginResponse = z.infer<typeof LoginResponse>;

/** Rotação: o refresh consumido é invalidado e um novo par de cookies é emitido. */
export const RefreshResponse = z.strictObject({
  csrfToken: z.string().min(1),
});
export type RefreshResponse = z.infer<typeof RefreshResponse>;

export const MeResponse = UsuarioAutenticado;
export type MeResponse = z.infer<typeof MeResponse>;

/**
 * Envelope de erro da api. O §12 diz que regra de negócio não conhece código de status:
 * o domínio lança `RepasseNaoAprovadoError`, o `ExceptionFilter` traduz para HTTP e
 * devolve este formato. `codigo` é estável e serve para o web decidir o que mostrar;
 * `mensagem` é texto para humano e pode mudar sem quebrar cliente.
 */
export const ErroApi = z.strictObject({
  codigo: z.string().min(1),
  mensagem: z.string().min(1),
  detalhes: z.unknown().optional(),
});
export type ErroApi = z.infer<typeof ErroApi>;
