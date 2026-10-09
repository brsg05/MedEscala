import {
  AbrirRepasseRequest,
  AgendaResponse,
  CadastroRequest,
  CandidatoResponse,
  ConcederChefiaRequest,
  ConfiguracaoInstituicaoRequest,
  ConviteResponse,
  COOKIE_CSRF_TOKEN,
  CriarDisponibilidadeRequest,
  CriarPlantaoRequest,
  CriarSetorRequest,
  CriarUnidadeRequest,
  DecisaoResponse,
  DisponibilidadeResponse,
  ErroApi,
  EstruturaResponse,
  EventoAuditoriaResponse,
  HEADER_CSRF_TOKEN,
  IndicarSubstitutosRequest,
  LoginRequest,
  LoginResponse,
  MeResponse,
  MedicoResponse,
  NotificacoesResponse,
  PendenciasResponse,
  PlantaoResponse,
  RecusarRepasseRequest,
  RepasseComPlantao,
  RepasseResponse,
} from '@medescala/contracts';
import { z } from 'zod';

const BASE = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';

/** Erro tipado que a UI sabe tratar, com o `codigo` estável vindo da api. */
export class ErroDaApi extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = 'ErroDaApi';
  }
}

/**
 * Lê o token de CSRF do cookie (D9).
 *
 * Este cookie é o único da sessão que NÃO é `httpOnly`, justamente para o JS
 * poder reenviá-lo no header. Os de access e refresh continuam invisíveis daqui
 * — é o que os protege de XSS.
 */
function csrfTokenAtual(): string | undefined {
  const par = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE_CSRF_TOKEN}=`));
  return par?.slice(COOKIE_CSRF_TOKEN.length + 1);
}

async function requisitar<T>(
  caminho: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const metodo = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);

  if (init?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (metodo !== 'GET' && metodo !== 'HEAD') {
    const csrf = csrfTokenAtual();
    if (csrf !== undefined) {
      headers.set(HEADER_CSRF_TOKEN, csrf);
    }
  }

  const resposta = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers,
    // Sem isto o navegador não envia os cookies httpOnly da sessão entre
    // :5173 e :3000, e toda rota protegida responde 401.
    credentials: 'include',
  });

  if (!resposta.ok) {
    const bruto: unknown = await resposta.json().catch(() => null);
    const erro = ErroApi.safeParse(bruto);

    throw new ErroDaApi(
      erro.success ? erro.data.codigo : 'ERRO_DESCONHECIDO',
      erro.success ? erro.data.mensagem : `Falha na requisição (${String(resposta.status)})`,
      resposta.status,
    );
  }

  if (resposta.status === 204) {
    return schema.parse(undefined);
  }

  // A resposta é validada com o MESMO schema que a api usa para produzi-la.
  // Se o contrato mudar de um lado só, quebra aqui — e antes disso, no typecheck.
  return schema.parse(await resposta.json());
}

const Nada = z.undefined();
const Criado = z.object({ id: z.uuid(), nome: z.string() });
const Chefia = z.object({ usuarioId: z.uuid(), nome: z.string(), email: z.string() });

function post<T>(caminho: string, schema: z.ZodType<T>, corpo: unknown = {}): Promise<T> {
  return requisitar(caminho, schema, { method: 'POST', body: JSON.stringify(corpo) });
}

/**
 * Recorte das listagens pelo modo ativo (DEC-067). O servidor só usa isto para
 * ESTREITAR o que o perfil da sessão já permite.
 */
export type Recorte = { modo: 'medico' } | { instituicaoId: string };

function consulta(recorte: Recorte): string {
  return 'modo' in recorte ? '?modo=medico' : `?instituicaoId=${recorte.instituicaoId}`;
}

export const api = {
  // --- sessão e cadastro ----------------------------------------------------

  login: (credenciais: LoginRequest): Promise<LoginResponse> =>
    post('/auth/login', LoginResponse, LoginRequest.parse(credenciais)),

  /** DEC-059 — cadastro aberto, provisório. Já devolve a sessão aberta. */
  cadastrar: (dados: CadastroRequest): Promise<LoginResponse> =>
    post('/auth/cadastro', LoginResponse, CadastroRequest.parse(dados)),

  me: (): Promise<MeResponse> => requisitar('/auth/me', MeResponse),

  logout: async (): Promise<void> => {
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { [HEADER_CSRF_TOKEN]: csrfTokenAtual() ?? '' },
    });
  },

  // --- médico (F01, F04, F05) -----------------------------------------------

  meuCadastroMedico: (): Promise<MedicoResponse> => requisitar('/medicos/me', MedicoResponse),

  agenda: (desde: Date, ate: Date): Promise<AgendaResponse> =>
    requisitar(
      `/medicos/me/agenda?desde=${desde.toISOString()}&ate=${ate.toISOString()}`,
      AgendaResponse,
    ),

  disponibilidades: (): Promise<DisponibilidadeResponse[]> =>
    requisitar('/medicos/me/disponibilidades', z.array(DisponibilidadeResponse)),

  declararDisponibilidade: (dados: CriarDisponibilidadeRequest): Promise<DisponibilidadeResponse> =>
    post('/medicos/me/disponibilidades', DisponibilidadeResponse, dados),

  removerDisponibilidade: (id: string): Promise<undefined> =>
    requisitar(`/medicos/me/disponibilidades/${id}`, Nada, { method: 'DELETE' }),

  // --- repasse (F07, F10, F11) ----------------------------------------------

  decisoesPendentes: (recorte: Recorte): Promise<DecisaoResponse[]> =>
    requisitar(`/decisoes${consulta(recorte)}`, z.array(DecisaoResponse)),

  repasses: (recorte: Recorte): Promise<RepasseComPlantao[]> =>
    requisitar(`/repasses${consulta(recorte)}`, z.array(RepasseComPlantao)),

  abrirRepasse: (plantaoId: string, dados: AbrirRepasseRequest): Promise<RepasseResponse> =>
    post(`/plantoes/${plantaoId}/repasses`, RepasseResponse, AbrirRepasseRequest.parse(dados)),

  aceitarRepasse: (repasseId: string): Promise<RepasseResponse> =>
    post(`/repasses/${repasseId}/aceitar`, RepasseResponse),

  aprovarRepasse: (repasseId: string): Promise<RepasseResponse> =>
    post(`/repasses/${repasseId}/aprovar`, RepasseResponse),

  recusarRepasse: (repasseId: string, dados: RecusarRepasseRequest): Promise<RepasseResponse> =>
    post(`/repasses/${repasseId}/recusar`, RepasseResponse, dados),

  // --- fila de convites (DEC-087 a DEC-099) -----------------------------------

  /** Forma 1 — quem se ofereceu para o horário, sem o próprio titular. */
  substitutos: (plantaoId: string): Promise<CandidatoResponse[]> =>
    requisitar(`/plantoes/${plantaoId}/substitutos`, z.array(CandidatoResponse)),

  /** DEC-091 — apontamento individual por CRM + UF exato. */
  buscarPorCrm: (crm: string, uf: string): Promise<CandidatoResponse> =>
    requisitar(
      `/medicos/busca?crm=${encodeURIComponent(crm)}&uf=${encodeURIComponent(uf)}`,
      CandidatoResponse,
    ),

  recusarConvite: (repasseId: string): Promise<RepasseResponse> =>
    post(`/repasses/${repasseId}/recusar-convite`, RepasseResponse),

  cancelarRepasse: (repasseId: string): Promise<RepasseResponse> =>
    post(`/repasses/${repasseId}/cancelar`, RepasseResponse),

  indicar: (repasseId: string, dados: IndicarSubstitutosRequest): Promise<RepasseResponse> =>
    post(`/repasses/${repasseId}/indicar`, RepasseResponse, IndicarSubstitutosRequest.parse(dados)),

  filaDoRepasse: (repasseId: string): Promise<ConviteResponse[]> =>
    requisitar(`/repasses/${repasseId}/fila`, z.array(ConviteResponse)),

  // --- instituição (F03, F06, F12, F23) -------------------------------------

  estrutura: (instituicaoId: string): Promise<EstruturaResponse> =>
    requisitar(`/instituicoes/${instituicaoId}/estrutura`, EstruturaResponse),

  plantoesDaInstituicao: (
    instituicaoId: string,
    desde: Date,
    ate: Date,
  ): Promise<PlantaoResponse[]> =>
    requisitar(
      `/instituicoes/${instituicaoId}/plantoes?desde=${desde.toISOString()}&ate=${ate.toISOString()}`,
      z.array(PlantaoResponse),
    ),

  publicarVaga: (dados: CriarPlantaoRequest): Promise<PlantaoResponse> =>
    post('/plantoes', PlantaoResponse, CriarPlantaoRequest.parse(dados)),

  candidatos: (plantaoId: string): Promise<CandidatoResponse[]> =>
    requisitar(`/plantoes/${plantaoId}/candidatos`, z.array(CandidatoResponse)),

  escalar: (plantaoId: string, medicoId: string): Promise<PlantaoResponse> =>
    post(`/plantoes/${plantaoId}/atribuir`, PlantaoResponse, { medicoId }),

  criarUnidade: (instituicaoId: string, dados: CriarUnidadeRequest) =>
    post(`/instituicoes/${instituicaoId}/unidades`, Criado, dados),

  criarSetor: (unidadeId: string, dados: CriarSetorRequest) =>
    post(`/unidades/${unidadeId}/setores`, Criado, dados),

  concederChefia: (instituicaoId: string, dados: ConcederChefiaRequest) =>
    post(`/instituicoes/${instituicaoId}/chefias`, Chefia, dados),

  configurarInstituicao: (
    instituicaoId: string,
    dados: ConfiguracaoInstituicaoRequest,
  ): Promise<undefined> =>
    requisitar(`/instituicoes/${instituicaoId}/configuracao`, Nada, {
      method: 'PATCH',
      body: JSON.stringify(ConfiguracaoInstituicaoRequest.parse(dados)),
    }),

  trilha: (plantaoId: string): Promise<EventoAuditoriaResponse[]> =>
    requisitar(`/plantoes/${plantaoId}/auditoria`, z.array(EventoAuditoriaResponse)),

  // --- operador da plataforma -----------------------------------------------

  pendencias: (): Promise<PendenciasResponse> =>
    requisitar('/operador/pendencias', PendenciasResponse),

  aprovarInstituicao: (id: string): Promise<undefined> =>
    post(`/operador/instituicoes/${id}/aprovar`, Nada),

  verificarMedico: (id: string): Promise<undefined> =>
    post(`/operador/medicos/${id}/verificar`, Nada),

  // --- avisos (F22) -----------------------------------------------------------

  notificacoes: (): Promise<NotificacoesResponse> =>
    requisitar('/notificacoes', NotificacoesResponse),

  marcarNotificacaoLida: (id: string): Promise<undefined> => post(`/notificacoes/${id}/lida`, Nada),

  marcarTodasLidas: (): Promise<undefined> => post('/notificacoes/lidas', Nada),
};
