import { useCallback, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import {
  ConcederChefiaRequest,
  ConfiguracaoInstituicaoRequest,
  CriarSetorRequest,
  CriarUnidadeRequest,
  type UsuarioAutenticado,
} from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { ErroDeFormulario } from '@/componentes/Painel';
import { Button } from '@/componentes/ui/button';
import { Etiqueta } from '@/componentes/ui/etiqueta';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { AvisoDePendencia } from './AvisoDePendencia';

/**
 * F03 — unidades, setores e quem chefia a escala.
 *
 * Só o ADMIN_INSTITUICAO edita; a chefia vê a mesma tela em leitura. A
 * estrutura pode ser montada com a instituição ainda pendente (DEC-066), para
 * estar pronta quando o CNPJ for confirmado.
 */
export function Estrutura({ usuario }: { usuario: UsuarioAutenticado }): React.JSX.Element {
  const { instituicaoId = '' } = useParams();
  const buscar = useCallback(() => api.estrutura(instituicaoId), [instituicaoId]);
  const estrutura = useRecurso(buscar, [instituicaoId]);

  const admin = usuario.perfis.some(
    (p) => p.perfil === 'ADMIN_INSTITUICAO' && p.instituicaoId === instituicaoId,
  );

  const dado = estrutura.dado;

  return (
    <div className="space-y-6">
      <header>
        <p className="sinal">Estrutura</p>
        <h1
          className="mt-2 text-2xl font-extrabold tracking-tight text-gelo"
          style={{ fontFamily: 'var(--font-sinal)' }}
        >
          {dado?.instituicao.nome ?? 'Instituição'}
        </h1>
        {dado !== null && (
          <p className="dado mt-1 text-sm text-gelo-3">
            CNPJ{' '}
            {dado.instituicao.cnpj.replace(
              /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/u,
              '$1.$2.$3/$4-$5',
            )}
          </p>
        )}
      </header>

      {dado?.instituicao.status === 'PENDENTE' && <AvisoDePendencia />}

      <ErroDeFormulario mensagem={estrutura.erro} />

      {estrutura.carregando && (
        <div
          className="h-40 animate-pulse rounded-xl border border-borda bg-tinta-2"
          aria-label="Carregando"
        />
      )}

      {dado !== null && (
        <>
          <section aria-label="Unidades e setores" className="space-y-3">
            <p className="sinal">Unidades e setores</p>

            {dado.unidades.length === 0 && (
              <p className="rounded-xl border border-dashed border-borda px-4 py-6 text-center text-sm text-gelo-3">
                Nenhuma unidade ainda.{admin ? ' Cadastre a primeira abaixo.' : ''}
              </p>
            )}

            {dado.unidades.map((u) => (
              <article key={u.id} className="rounded-xl border border-borda bg-tinta-2 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold text-gelo">{u.nome}</h2>
                  {u.cnes !== null && (
                    <span className="dado text-xs text-gelo-3">CNES {u.cnes}</span>
                  )}
                </div>

                <ul className="mt-3 space-y-1.5">
                  {u.setores.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-tinta-3 px-3 py-2"
                    >
                      <span className="text-sm text-gelo">{s.nome}</span>
                      <span className="text-xs text-gelo-3">{s.especialidadeExigida}</span>
                    </li>
                  ))}
                  {u.setores.length === 0 && <li className="text-xs text-gelo-3">Sem setores.</li>}
                </ul>

                {admin && <NovoSetor unidadeId={u.id} aoCriar={estrutura.recarregar} />}
              </article>
            ))}

            {admin && <NovaUnidade instituicaoId={instituicaoId} aoCriar={estrutura.recarregar} />}
          </section>

          <section aria-label="Chefias de escala" className="space-y-3">
            <p className="sinal">Chefias de escala</p>
            <p className="text-sm leading-relaxed text-gelo-2">
              Quem aprova ou recusa as substituições desta instituição (F11).
            </p>

            <ul className="space-y-1.5">
              {dado.chefias.map((c) => (
                <li
                  key={c.usuarioId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-borda bg-tinta-2 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-gelo">{c.nome}</span>
                    <span className="block truncate text-xs text-gelo-3">{c.email}</span>
                  </span>
                  <Etiqueta estado="espera">aprova</Etiqueta>
                </li>
              ))}
            </ul>

            {admin && (
              <ConcederChefia instituicaoId={instituicaoId} aoConceder={estrutura.recarregar} />
            )}
          </section>

          <section aria-label="Prazos" className="space-y-3">
            <p className="sinal">Prazos</p>
            <Prazo
              instituicaoId={instituicaoId}
              campo="prazoConviteMinutos"
              atual={dado.instituicao.prazoConviteMinutos}
              editavel={admin}
              aoSalvar={estrutura.recarregar}
            />
            <Prazo
              instituicaoId={instituicaoId}
              campo="prazoContestacaoHoras"
              atual={dado.instituicao.prazoContestacaoHoras}
              editavel={admin}
              aoSalvar={estrutura.recarregar}
            />
          </section>

          <section aria-label="Pagamento e nota fiscal" className="space-y-3">
            <p className="sinal">Pagamento e nota fiscal</p>
            <AjustesFiscais
              instituicaoId={instituicaoId}
              permiteSubcontratacao={dado.instituicao.permiteSubcontratacao}
              issRetidoBp={dado.instituicao.issRetidoBp}
              editavel={admin}
              aoSalvar={estrutura.recarregar}
            />
          </section>
        </>
      )}
    </div>
  );
}

function NovaUnidade({
  instituicaoId,
  aoCriar,
}: {
  instituicaoId: string;
  aoCriar: () => void;
}): React.JSX.Element {
  const [nome, setNome] = useState('');
  const [cnes, setCnes] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);

    const validado = CriarUnidadeRequest.safeParse({
      nome,
      cnes: cnes.trim() === '' ? null : cnes,
    });
    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'Dados inválidos');
      return;
    }

    setEnviando(true);
    try {
      await api.criarUnidade(instituicaoId, validado.data);
      setNome('');
      setCnes('');
      aoCriar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível criar a unidade');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      className="space-y-3 rounded-xl border border-dashed border-borda p-4"
      noValidate
    >
      <p className="sinal">Nova unidade</p>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <div className="space-y-2">
          <Label htmlFor="unidade-nome">Nome</Label>
          <Input
            id="unidade-nome"
            placeholder="Ex.: UPA Torrões"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unidade-cnes">CNES</Label>
          <Input
            id="unidade-cnes"
            inputMode="numeric"
            placeholder="opcional"
            value={cnes}
            onChange={(e) => setCnes(e.target.value)}
          />
        </div>
      </div>
      <ErroDeFormulario mensagem={erro} />
      <Button type="submit" variante="contorno" className="w-full" disabled={enviando}>
        {enviando ? 'Criando…' : 'Criar unidade'}
      </Button>
    </form>
  );
}

function NovoSetor({
  unidadeId,
  aoCriar,
}: {
  unidadeId: string;
  aoCriar: () => void;
}): React.JSX.Element {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [especialidade, setEspecialidade] = useState('Clínica Médica');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!aberto) {
    return (
      <Button
        variante="discreto"
        tamanho="pequeno"
        className="mt-3"
        onClick={() => setAberto(true)}
      >
        + Setor
      </Button>
    );
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);

    const validado = CriarSetorRequest.safeParse({ nome, especialidadeExigida: especialidade });
    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'Dados inválidos');
      return;
    }

    setEnviando(true);
    try {
      await api.criarSetor(unidadeId, validado.data);
      setNome('');
      setAberto(false);
      aoCriar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível criar o setor');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      className="mt-3 space-y-3 border-t border-borda pt-3"
      noValidate
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`setor-nome-${unidadeId}`}>Setor</Label>
          <Input
            id={`setor-nome-${unidadeId}`}
            placeholder="Ex.: Sala Vermelha"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`setor-esp-${unidadeId}`}>Especialidade exigida</Label>
          <Input
            id={`setor-esp-${unidadeId}`}
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-gelo-3">
        A especialidade precisa ser escrita exatamente como no cadastro do médico — hoje a
        comparação é por texto.
      </p>
      <ErroDeFormulario mensagem={erro} />
      <div className="flex gap-2">
        <Button
          type="button"
          variante="contorno"
          tamanho="pequeno"
          className="flex-1"
          onClick={() => setAberto(false)}
        >
          Cancelar
        </Button>
        <Button type="submit" tamanho="pequeno" className="flex-1" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar setor'}
        </Button>
      </div>
    </form>
  );
}

/** DEC-064 — promove quem já tem conta. Não há convite por e-mail ainda (F22). */
function ConcederChefia({
  instituicaoId,
  aoConceder,
}: {
  instituicaoId: string;
  aoConceder: () => void;
}): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);

    const validado = ConcederChefiaRequest.safeParse({ email });
    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'E-mail inválido');
      return;
    }

    setEnviando(true);
    try {
      await api.concederChefia(instituicaoId, validado.data);
      setEmail('');
      aoConceder();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível conceder a chefia');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      className="space-y-3 rounded-xl border border-dashed border-borda p-4"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="chefia-email">Conceder chefia a</Label>
        <Input
          id="chefia-email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder="e-mail de quem já tem conta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="text-xs text-gelo-3">A pessoa precisa ter criado a conta antes.</p>
      </div>
      <ErroDeFormulario mensagem={erro} />
      <Button type="submit" variante="contorno" className="w-full" disabled={enviando}>
        {enviando ? 'Concedendo…' : 'Conceder chefia'}
      </Button>
    </form>
  );
}

type CampoDePrazo = 'prazoConviteMinutos' | 'prazoContestacaoHoras';

/** O que cada prazo significa, em uma tabela só — os dois formulários são iguais. */
const PRAZOS: Readonly<
  Record<
    CampoDePrazo,
    { rotulo: string; unidade: string; min: number; max: number; ajuda: string; leitura: string }
  >
> = {
  // DEC-090 — curto por desenho: a fila anda um por vez.
  prazoConviteMinutos: {
    rotulo: 'Prazo de cada convite de repasse (minutos)',
    unidade: 'min',
    min: 5,
    max: 1440,
    ajuda:
      'Quanto tempo cada pessoa da fila tem para aceitar antes de a vez passar à próxima. Entre 5 minutos e 24 horas; o padrão é 60. Vale para os próximos convites, não para o que já está correndo.',
    leitura: 'para cada convidado responder antes de a vez passar ao próximo',
  },
  // DEC-132 — cobre fim de semana com o padrão de 72h.
  prazoContestacaoHoras: {
    rotulo: 'Prazo para contestar um check-out (horas)',
    unidade: 'h',
    min: 1,
    max: 336,
    ajuda:
      'Depois do check-out do médico, por quanto tempo a chefia ainda pode contestar o plantão. Entre 1 hora e 14 dias; o padrão é 72. Vale para os próximos check-outs.',
    leitura: 'para a chefia contestar um check-out',
  },
};

function Prazo({
  instituicaoId,
  campo,
  atual,
  editavel,
  aoSalvar,
}: {
  instituicaoId: string;
  campo: CampoDePrazo;
  atual: number;
  editavel: boolean;
  aoSalvar: () => void;
}): React.JSX.Element {
  const meta = PRAZOS[campo];
  const [valor, setValor] = useState(String(atual));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);

    const validado = ConfiguracaoInstituicaoRequest.safeParse({ [campo]: Number(valor) });
    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'Prazo inválido');
      return;
    }

    setEnviando(true);
    try {
      await api.configurarInstituicao(instituicaoId, validado.data);
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar o prazo');
    } finally {
      setEnviando(false);
    }
  }

  if (!editavel) {
    return (
      <p className="rounded-lg border border-borda bg-tinta-2 px-4 py-3 text-sm text-gelo-2">
        <span className="dado font-semibold text-gelo">
          {atual} {meta.unidade}
        </span>{' '}
        {meta.leitura}.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      className="space-y-3 rounded-xl border border-dashed border-borda p-4"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor={campo}>{meta.rotulo}</Label>
        <Input
          id={campo}
          type="number"
          inputMode="numeric"
          min={meta.min}
          max={meta.max}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <p className="text-xs text-gelo-3">{meta.ajuda}</p>
      </div>
      <ErroDeFormulario mensagem={erro} />
      <Button
        type="submit"
        variante="contorno"
        className="w-full"
        disabled={enviando || Number(valor) === atual}
      >
        {enviando ? 'Salvando…' : 'Salvar prazo'}
      </Button>
    </form>
  );
}

/**
 * DEC-206 e DEC-207 — o que a instituição decide no lado fiscal: se aceita o
 * modelo B (subcontratação) e se o município manda reter ISS na fonte.
 */
function AjustesFiscais({
  instituicaoId,
  permiteSubcontratacao,
  issRetidoBp,
  editavel,
  aoSalvar,
}: {
  instituicaoId: string;
  permiteSubcontratacao: boolean;
  issRetidoBp: number | null;
  editavel: boolean;
  aoSalvar: () => void;
}): React.JSX.Element {
  const [b, setB] = useState(permiteSubcontratacao);
  const [iss, setIss] = useState(
    issRetidoBp === null ? '' : String(issRetidoBp / 100).replace('.', ','),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const issComoTexto =
    issRetidoBp === null
      ? 'sem retenção de ISS na fonte'
      : `ISS retido de ${String(issRetidoBp / 100).replace('.', ',')}%`;

  if (!editavel) {
    return (
      <p className="rounded-lg border border-borda bg-tinta-2 px-4 py-3 text-sm text-gelo-2">
        {permiteSubcontratacao ? 'Aceita' : 'Não aceita'} subcontratação (modelo B) · {issComoTexto}
        .
      </p>
    );
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);

    const texto = iss.trim().replace(',', '.');
    const bp = texto === '' ? null : Math.round(Number(texto) * 100);
    if (bp !== null && Number.isNaN(bp)) {
      setErro('ISS inválido. Use, por exemplo, 5 ou 2,5');
      return;
    }

    const validado = ConfiguracaoInstituicaoRequest.safeParse({
      permiteSubcontratacao: b,
      issRetidoBp: bp,
    });
    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? 'Dados inválidos');
      return;
    }

    setEnviando(true);
    try {
      await api.configurarInstituicao(instituicaoId, validado.data);
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      className="space-y-4 rounded-xl border border-dashed border-borda p-4"
      noValidate
    >
      <label className="flex cursor-pointer gap-3">
        <input
          type="checkbox"
          checked={b}
          onChange={(e) => setB(e.target.checked)}
          className="mt-1 accent-[var(--color-turno)]"
        />
        <span>
          <span className="block text-sm text-gelo">Aceitar subcontratação (modelo B)</span>
          <span className="block text-xs text-gelo-3">
            O titular continua contratado e subcontrata o substituto. Gera duas notas e pode
            tributar o mesmo valor duas vezes; o titular vê esse alerta antes de escolher. O padrão
            é o modelo A.
          </span>
        </span>
      </label>

      <div className="space-y-2">
        <Label htmlFor="iss-retido">ISS retido na fonte (%)</Label>
        <Input
          id="iss-retido"
          inputMode="decimal"
          placeholder="vazio = sem retenção"
          value={iss}
          onChange={(e) => setIss(e.target.value)}
        />
        <p className="text-xs text-gelo-3">
          Preencha se o município manda a instituição reter o ISS do médico (entre 2% e 5%). Entra
          no rascunho da NFS-e de cada plantão.
        </p>
      </div>

      <ErroDeFormulario mensagem={erro} />
      <Button type="submit" variante="contorno" className="w-full" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  );
}
