import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

/**
 * Testes de renderização.
 *
 * Existem porque `tsc` e `vite build` não EXECUTAM o código: um erro de import ou
 * de render passa por lint, typecheck, build e pelos e2e da api, e só aparece
 * como tela branca no navegador. Foi exatamente o que aconteceu uma vez.
 *
 * Eles não cobrem formato de módulo (CJS × ESM) — o Vitest roda em Node, que faz
 * o interop sozinho. Essa garantia mora no build de @medescala/contracts.
 */

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const HOSPITAL = '22222222-2222-4222-8222-222222222222';

function usuario(
  perfis: Array<{ perfil: string; instituicaoId: string | null; instituicaoNome: string | null }>,
) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'pessoa@medescala.test',
    nome: 'Ana Medeiros',
    perfis,
  };
}

const MEDICA = usuario([{ perfil: 'MEDICO', instituicaoId: null, instituicaoNome: null }]);
const CHEFIA = usuario([
  { perfil: 'CHEFIA_ESCALA', instituicaoId: HOSPITAL, instituicaoNome: 'Hospital Escola' },
]);
/** Médica num lugar e chefia em outro — o caso que motivou a troca de modo (DEC-061). */
const MEDICA_E_CHEFIA = usuario([
  { perfil: 'MEDICO', instituicaoId: null, instituicaoNome: null },
  { perfil: 'CHEFIA_ESCALA', instituicaoId: HOSPITAL, instituicaoNome: 'Hospital Escola' },
]);
const OPERADOR = usuario([
  { perfil: 'OPERADOR_PLATAFORMA', instituicaoId: null, instituicaoNome: null },
]);

/**
 * O plantão cai no dia de HOJE, das 10h às 18h locais: as telas de escala mostram
 * o dia corrente e filtram por ele. Data fixa faria o teste depender do dia.
 */
const HOJE_10H = new Date();
HOJE_10H.setHours(10, 0, 0, 0);

const PLANTAO = {
  id: '33333333-3333-4333-8333-333333333333',
  inicio: HOJE_10H.toISOString(),
  fim: new Date(HOJE_10H.getTime() + 8 * 3600_000).toISOString(),
  valorCentavos: 120_000,
  especialidadeExigida: 'Clínica Médica',
  requisitos: [],
  modeloContratacao: 'PJ',
  status: 'CONFIRMADO',
  setor: {
    id: '44444444-4444-4444-8444-444444444444',
    nome: 'Sala Vermelha',
    unidade: 'UPA Torrões',
    instituicao: 'Hospital Escola',
  },
  titular: {
    id: '55555555-5555-4555-8555-555555555555',
    nome: 'Ana Medeiros',
    crm: '12345',
    crmUf: 'PE',
  },
  executante: {
    id: '55555555-5555-4555-8555-555555555555',
    nome: 'Ana Medeiros',
    crm: '12345',
    crmUf: 'PE',
  },
};

const VAGA_ABERTA = {
  ...PLANTAO,
  id: '66666666-6666-4666-8666-666666666666',
  status: 'ABERTO',
  titular: null,
  executante: null,
};

function estrutura(status: 'ATIVA' | 'PENDENTE') {
  return {
    instituicao: {
      id: HOSPITAL,
      nome: 'Hospital Escola',
      cnpj: '12345678000190',
      status,
      prazoConviteRepasseMinutos: 60,
    },
    unidades: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        nome: 'UPA Torrões',
        cnes: '1234567',
        setores: [
          { id: PLANTAO.setor.id, nome: 'Sala Vermelha', especialidadeExigida: 'Clínica Médica' },
        ],
      },
    ],
    chefias: [],
  };
}

/**
 * Mock que responde por ROTA, e não com um corpo único — e rotas mais longas
 * primeiro, para `/instituicoes/x/plantoes` não casar com `/instituicoes/x`.
 */
function responderPorRota(mapa: Record<string, () => Response>): void {
  const rotas = Object.keys(mapa).sort((a, b) => b.length - a.length);
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL) => {
      const url = String(entrada);
      const rota = rotas.find((r) => url.includes(r));
      return Promise.resolve(rota === undefined ? json(404, {}) : (mapa[rota] as () => Response)());
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // URL e "último modo" sobrevivem entre testes no jsdom; sem isto, um teste
  // começaria na tela em que o anterior terminou.
  window.history.replaceState({}, '', '/');
  localStorage.clear();
});

describe('sem sessão', () => {
  const SEM_SESSAO = {
    '/auth/me': () =>
      json(401, { codigo: 'NAO_AUTENTICADO', mensagem: 'É necessário estar autenticado' }),
  };

  it('mostra o login com a tese do produto', async () => {
    responderPorRota(SEM_SESSAO);
    render(<App />);

    expect(await screen.findByLabelText('E-mail')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDefined();
    expect(screen.getByText('titular')).toBeDefined();
    expect(screen.getByText('instituição')).toBeDefined();
  });

  it('valida o e-mail com o mesmo schema Zod da api, antes de qualquer rede', async () => {
    responderPorRota(SEM_SESSAO);
    const { container } = render(<App />);
    await screen.findByRole('button', { name: 'Entrar' });

    const chamadasAntes = vi.mocked(fetch).mock.calls.length;
    container.querySelector('form')?.requestSubmit();

    await waitFor(() => {
      expect(screen.getByText('E-mail inválido')).toBeDefined();
    });
    expect(vi.mocked(fetch).mock.calls.length).toBe(chamadasAntes);
  });

  it('leva ao cadastro, que avisa da conferência ANTES de criar a conta (DEC-059)', async () => {
    responderPorRota(SEM_SESSAO);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText(/CRM é conferido pela plataforma/u)).toBeDefined();

    fireEvent.click(screen.getByRole('radio', { name: 'Represento uma instituição' }));
    expect(screen.getByText(/CNPJ é conferido pela plataforma/u)).toBeDefined();
    expect(screen.getByLabelText('CNPJ')).toBeDefined();
  });
});

describe('modo médico', () => {
  it('abre na escala e mostra o plantão vindo da api', async () => {
    responderPorRota({
      '/auth/me': () => json(200, MEDICA),
      '/medicos/me/agenda': () => json(200, { plantoes: [PLANTAO], alertaCargaHoraria: null }),
    });
    render(<App />);

    expect(await screen.findByText('Sua escala')).toBeDefined();
    expect(await screen.findByText('Sala Vermelha')).toBeDefined();
    expect(screen.getByText('Sala Vermelha · UPA Torrões')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Pedir repasse' })).toBeDefined();
  });

  it('mostra o alerta de 24h contíguas da RN03 sem bloquear nada', async () => {
    responderPorRota({
      '/auth/me': () => json(200, MEDICA),
      '/medicos/me/agenda': () =>
        json(200, {
          plantoes: [PLANTAO],
          alertaCargaHoraria: { horasContiguas: 36, limite: 24 },
        }),
    });
    render(<App />);

    expect(await screen.findByText(/36h seguidas/u)).toBeDefined();
  });

  it('tem a navegação do médico, inclusive Disponível (F04)', async () => {
    responderPorRota({
      '/auth/me': () => json(200, MEDICA),
      '/medicos/me/agenda': () => json(200, { plantoes: [], alertaCargaHoraria: null }),
    });
    render(<App />);
    await screen.findByText('Sua escala');

    for (const secao of ['Escala', 'Disponível', 'Decisões', 'Repasses', 'Conta']) {
      expect(screen.getAllByRole('link', { name: secao }).length).toBeGreaterThan(0);
    }
    // Não vê nada da instituição.
    expect(screen.queryByRole('link', { name: 'Estrutura' })).toBeNull();
  });

  it('distingue o dia vazio do estado explicativo — duas mensagens, não a mesma duas vezes', async () => {
    responderPorRota({
      '/auth/me': () => json(200, MEDICA),
      '/medicos/me/agenda': () => json(200, { plantoes: [], alertaCargaHoraria: null }),
    });
    render(<App />);
    await screen.findByText('Sua escala');

    expect(await screen.findByText('Nenhum plantão neste dia')).toBeDefined();
    expect(screen.getByText('Dia livre na sua escala')).toBeDefined();
  });

  it('mostra o erro da api em vez de uma tela vazia enganosa', async () => {
    responderPorRota({
      '/auth/me': () => json(200, MEDICA),
      '/medicos/me/agenda': () =>
        json(404, {
          codigo: 'MEDICO_NAO_ENCONTRADO',
          mensagem: 'Nenhum cadastro de médico encontrado',
        }),
    });
    render(<App />);

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText(/Nenhum cadastro de médico/u)).toBeDefined();
  });
});

describe('modo instituição (DEC-061)', () => {
  it('a chefia cai na escala DA INSTITUIÇÃO, com o turno descoberto em destaque', async () => {
    responderPorRota({
      '/auth/me': () => json(200, CHEFIA),
      [`/instituicoes/${HOSPITAL}/estrutura`]: () => json(200, estrutura('ATIVA')),
      [`/instituicoes/${HOSPITAL}/plantoes`]: () => json(200, [VAGA_ABERTA]),
    });
    render(<App />);

    expect(await screen.findByText('Escala da instituição')).toBeDefined();
    expect(await screen.findByText('1 turno descoberto')).toBeDefined();
    expect(screen.getByText('Ninguém escalado')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Escalar médico' })).toBeDefined();
    // Navegação da instituição, não a do médico.
    expect(screen.getAllByRole('link', { name: 'Estrutura' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Disponível' })).toBeNull();
  });

  it('instituição pendente vê o aviso e não consegue publicar vaga (DEC-063)', async () => {
    responderPorRota({
      '/auth/me': () => json(200, CHEFIA),
      [`/instituicoes/${HOSPITAL}/estrutura`]: () => json(200, estrutura('PENDENTE')),
      [`/instituicoes/${HOSPITAL}/plantoes`]: () => json(200, []),
    });
    render(<App />);

    expect(await screen.findByText('CNPJ em conferência')).toBeDefined();
    await waitFor(() => {
      const botao = screen.getByRole('button', { name: 'Publicar vaga' }) as HTMLButtonElement;
      expect(botao.disabled).toBe(true);
    });
  });

  it('quem é médica e chefia escolhe o contexto pelo seletor', async () => {
    responderPorRota({
      '/auth/me': () => json(200, MEDICA_E_CHEFIA),
      '/medicos/me/agenda': () => json(200, { plantoes: [], alertaCargaHoraria: null }),
      [`/instituicoes/${HOSPITAL}/estrutura`]: () => json(200, estrutura('ATIVA')),
      [`/instituicoes/${HOSPITAL}/plantoes`]: () => json(200, []),
    });
    render(<App />);

    // Começa no primeiro modo — médico.
    expect(await screen.findByText('Sua escala')).toBeDefined();

    // Há um seletor no topo (celular) e outro na lateral (desktop); qualquer um serve.
    fireEvent.click(screen.getAllByRole('button', { name: /Como médico/u })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Hospital Escola/u }));

    expect(await screen.findByText('Escala da instituição')).toBeDefined();
  });
});

describe('modo operador', () => {
  it('vê as duas filas de conferência', async () => {
    responderPorRota({
      '/auth/me': () => json(200, OPERADOR),
      '/operador/pendencias': () =>
        json(200, {
          instituicoes: [
            {
              id: '88888888-8888-4888-8888-888888888888',
              nome: 'Clínica Nova Esperança',
              cnpj: '98765432000110',
              status: 'PENDENTE',
              criadaEm: new Date().toISOString(),
            },
          ],
          medicos: [],
        }),
    });
    render(<App />);

    expect(await screen.findByText('1 a conferir')).toBeDefined();
    expect(screen.getByText('Clínica Nova Esperança')).toBeDefined();
    expect(screen.getByText('98.765.432/0001-10', { exact: false })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeDefined();
  });
});

describe('fila de convites do repasse (DEC-087)', () => {
  const COLEGA = {
    id: '99999999-9999-4999-8999-999999999999',
    nome: 'Bruno Lacerda',
    crm: '70002',
    crmUf: 'PE',
    especialidade: 'Clínica Médica',
  };
  const { especialidade: _e, ...COLEGA_RESUMO } = COLEGA;

  function repasse(sobrescrever: Record<string, unknown> = {}) {
    return {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      plantaoId: PLANTAO.id,
      status: 'SOLICITADO',
      motivo: 'Junta médica no mesmo horário',
      modeloFiscal: 'A_RECONTRATACAO',
      titular: { id: MEDICA.id, nome: MEDICA.nome, crm: '12345', crmUf: 'PE' },
      substituto: null,
      convidadoDaVez: null,
      prazoConviteAte: null,
      origemConvite: null,
      filaEsgotada: false,
      aprovadoEm: null,
      justificativaRecusa: null,
      ...sobrescrever,
    };
  }

  function corpoDaChamada(rota: string): unknown {
    const chamada = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes(rota));
    const init = chamada?.[1] as RequestInit | undefined;
    return typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  }

  it('o titular monta a fila com quem se ofereceu, e ela vai como `indicados`', async () => {
    responderPorRota({
      '/auth/me': () => json(200, MEDICA),
      '/medicos/me/agenda': () => json(200, { plantoes: [PLANTAO], alertaCargaHoraria: null }),
      [`/plantoes/${PLANTAO.id}/substitutos`]: () => json(200, [COLEGA]),
      [`/plantoes/${PLANTAO.id}/repasses`]: () => json(201, repasse()),
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Pedir repasse' }));
    fireEvent.change(await screen.findByLabelText('Motivo'), {
      target: { value: 'Junta médica no mesmo horário' },
    });

    // Sem ninguém na fila, o pedido vira convite aberto.
    expect(screen.getByRole('button', { name: 'Abrir convite aberto' })).toBeDefined();

    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar' }));
    expect(screen.getByRole('button', { name: 'Na fila' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir e convidar' }));

    await waitFor(() => {
      expect(corpoDaChamada(`/plantoes/${PLANTAO.id}/repasses`)).toEqual({
        motivo: 'Junta médica no mesmo horário',
        modeloFiscal: 'A_RECONTRATACAO',
        indicados: [COLEGA.id],
      });
    });
  });

  it('o convidado vê o prazo e recusa sem justificativa — só passa a vez', async () => {
    const prazo = new Date(Date.now() + 3600_000).toISOString();
    responderPorRota({
      '/auth/me': () => json(200, MEDICA),
      '/decisoes': () =>
        json(200, [
          {
            tipo: 'ACEITAR_CONVITE',
            plantao: PLANTAO,
            repasse: repasse({
              titular: PLANTAO.titular,
              convidadoDaVez: { ...COLEGA_RESUMO, id: MEDICA.id, nome: MEDICA.nome },
              prazoConviteAte: prazo,
              origemConvite: 'INDICACAO',
            }),
          },
        ]),
      '/recusar-convite': () => json(200, repasse()),
    });
    window.history.replaceState({}, '', '/decisoes');
    render(<App />);

    expect(await screen.findByText(/responda até/u)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));

    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/recusar-convite')),
      ).toBe(true);
    });
    expect(screen.queryByLabelText('Justificativa da recusa')).toBeNull();
  });

  it('fila esgotada volta ao titular, com indicar mais e cancelar (DEC-096)', async () => {
    responderPorRota({
      '/auth/me': () => json(200, MEDICA),
      '/repasses': () =>
        json(200, [{ repasse: repasse({ filaEsgotada: true }), plantao: PLANTAO }]),
    });
    window.history.replaceState({}, '', '/repasses');
    render(<App />);

    expect(await screen.findByText(/Ninguém aceitou\. Indique outras pessoas/u)).toBeDefined();
    expect(screen.getByText(/ninguém aceitou — o titular pode indicar/u)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Indicar mais pessoas' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancelar repasse' })).toBeDefined();
  });

  it('o elo do substituto mostra quem tem o convite agora', async () => {
    responderPorRota({
      '/auth/me': () => json(200, MEDICA),
      '/repasses': () =>
        json(200, [
          {
            repasse: repasse({
              convidadoDaVez: COLEGA_RESUMO,
              prazoConviteAte: new Date(Date.now() + 3600_000).toISOString(),
              origemConvite: 'MATCHING',
            }),
            plantao: PLANTAO,
          },
        ]),
    });
    window.history.replaceState({}, '', '/repasses');
    render(<App />);

    expect(await screen.findByText('Bruno Lacerda')).toBeDefined();
    expect(screen.getByText('convidado pelo matching, ainda não respondeu')).toBeDefined();
  });
});
