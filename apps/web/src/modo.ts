import type { UsuarioAutenticado } from '@medescala/contracts';

/**
 * Modo de uso — DEC-061.
 *
 * A mesma pessoa pode ser médica numa instituição e chefia em outra (ADR-006).
 * Em vez de misturar tudo numa navegação só, ela escolhe "como quem" está
 * usando o app, e cada modo tem a sua navegação enxuta.
 *
 * O modo ativo é LIDO DA URL (`/escala`, `/instituicao/:id/...`, `/operador`),
 * não guardado em estado escondido: toda tela pode ser aberta por link, e trocar
 * de modo é só navegar (DEC-078).
 */
export type Modo =
  | { tipo: 'medico'; rotulo: string; inicio: string }
  | {
      tipo: 'instituicao';
      rotulo: string;
      inicio: string;
      instituicaoId: string;
      admin: boolean;
      chefia: boolean;
    }
  | { tipo: 'operador'; rotulo: string; inicio: string };

export function modosDisponiveis(usuario: UsuarioAutenticado): Modo[] {
  const modos: Modo[] = [];

  if (usuario.perfis.some((p) => p.perfil === 'MEDICO')) {
    modos.push({ tipo: 'medico', rotulo: 'Como médico', inicio: '/escala' });
  }

  // Uma entrada por instituição, juntando os perfis que a pessoa tem nela.
  const porInstituicao = new Map<string, { nome: string; admin: boolean; chefia: boolean }>();

  for (const p of usuario.perfis) {
    if (p.instituicaoId === null) {
      continue;
    }
    if (p.perfil !== 'ADMIN_INSTITUICAO' && p.perfil !== 'CHEFIA_ESCALA') {
      continue;
    }

    const atual = porInstituicao.get(p.instituicaoId) ?? {
      nome: p.instituicaoNome ?? 'Instituição',
      admin: false,
      chefia: false,
    };
    if (p.perfil === 'ADMIN_INSTITUICAO') atual.admin = true;
    if (p.perfil === 'CHEFIA_ESCALA') atual.chefia = true;
    porInstituicao.set(p.instituicaoId, atual);
  }

  for (const [instituicaoId, info] of porInstituicao) {
    modos.push({
      tipo: 'instituicao',
      rotulo: info.nome,
      inicio: `/instituicao/${instituicaoId}/escala`,
      instituicaoId,
      admin: info.admin,
      chefia: info.chefia,
    });
  }

  if (usuario.perfis.some((p) => p.perfil === 'OPERADOR_PLATAFORMA')) {
    modos.push({ tipo: 'operador', rotulo: 'Operador da plataforma', inicio: '/operador' });
  }

  return modos;
}

/** Descobre o modo ativo pela URL. `null` quando a rota não pertence a modo nenhum (ex.: /conta). */
export function modoDaRota(modos: readonly Modo[], caminho: string): Modo | null {
  const inst = /^\/instituicao\/([^/]+)/u.exec(caminho);

  if (inst !== null) {
    return modos.find((m) => m.tipo === 'instituicao' && m.instituicaoId === inst[1]) ?? null;
  }

  if (caminho.startsWith('/operador')) {
    return modos.find((m) => m.tipo === 'operador') ?? null;
  }

  if (
    ['/escala', '/disponibilidade', '/decisoes', '/repasses'].some((r) => caminho.startsWith(r))
  ) {
    return modos.find((m) => m.tipo === 'medico') ?? null;
  }

  return null;
}

const CHAVE_ULTIMO_MODO = 'medescala:ultimo-modo';

/**
 * Lembra o último modo usado, para o próximo login cair nele.
 *
 * É conveniência por navegador — não é estado de negócio. `localStorage` pode
 * lançar exceção (aba anônima, bloqueio de dados), então tudo é protegido.
 */
export function lembrarModo(modo: Modo): void {
  try {
    localStorage.setItem(CHAVE_ULTIMO_MODO, modo.inicio);
  } catch {
    /* sem armazenamento: só perde a conveniência */
  }
}

/**
 * O modo cuja navegação aparece. Numa rota de modo, é ele; numa rota de fora
 * (ex.: /conta), é o último usado — senão a pessoa entra em Conta e as outras
 * abas somem, sem caminho de volta (DEC-183).
 */
export function modoDeContexto(modos: readonly Modo[], caminho: string): Modo | null {
  const daRota = modoDaRota(modos, caminho);
  if (daRota !== null) {
    return daRota;
  }
  const inicio = rotaInicial(modos);
  return modos.find((m) => m.inicio === inicio) ?? null;
}

export function rotaInicial(modos: readonly Modo[]): string {
  let salvo: string | null = null;

  try {
    salvo = localStorage.getItem(CHAVE_ULTIMO_MODO);
  } catch {
    salvo = null;
  }

  // Só respeita o salvo se o usuário ainda tiver aquele modo — um perfil pode
  // ter sido revogado desde a última visita.
  if (salvo !== null && modos.some((m) => m.inicio === salvo)) {
    return salvo;
  }

  return modos[0]?.inicio ?? '/conta';
}
