import { useEffect, useState, type FormEvent } from 'react';
import {
  CadastroRequest,
  UfBrasileira,
  type PoliticaResponse,
  type UsuarioAutenticado,
} from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { MarcaDoApp } from '@/componentes/AppShell';
import { ErroDeFormulario, Painel } from '@/componentes/Painel';
import { PoliticaDePrivacidade } from '@/componentes/PoliticaDePrivacidade';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { cn } from '@/lib/utils';

type Tipo = 'MEDICO' | 'INSTITUICAO';

interface Props {
  aoEntrar: (usuario: UsuarioAutenticado) => void;
  aoVoltar: () => void;
}

/**
 * Cadastro aberto — PROVISÓRIO (DEC-059).
 *
 * A trava de cada lado é dita ANTES do botão, não depois: quem se cadastra
 * precisa saber que o CRM (RN02) ou o CNPJ (DEC-063) passa por conferência, ou
 * vai achar que o app quebrou quando não conseguir entrar em escala.
 */
export function Cadastro({ aoEntrar, aoVoltar }: Props): React.JSX.Element {
  const [tipo, setTipo] = useState<Tipo>('MEDICO');
  const [campos, setCampos] = useState<Record<string, string>>({ crmUf: 'PE' });
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // F24 — sem aceite da política vigente não há conta (DEC-225).
  const [politica, setPolitica] = useState<PoliticaResponse | null>(null);
  const [aceitou, setAceitou] = useState(false);
  const [lendoPolitica, setLendoPolitica] = useState(false);

  useEffect(() => {
    api
      .politica()
      .then(setPolitica)
      .catch(() => {
        setErro('Não foi possível carregar a política de privacidade. Recarregue a página.');
      });
  }, []);

  function campo(nome: string): {
    value: string;
    onChange: (e: { target: { value: string } }) => void;
  } {
    return {
      value: campos[nome] ?? '',
      onChange: (e) => setCampos((c) => ({ ...c, [nome]: e.target.value })),
    };
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErro(null);
    setErrosDeCampo({});

    // Vazio quando não marcou: o schema recusa e a mensagem aparece no campo.
    const aceitePolitica = aceitou ? (politica?.versao ?? '') : '';

    const bruto =
      tipo === 'MEDICO'
        ? {
            tipo,
            nome: campos['nome'],
            email: campos['email'],
            senha: campos['senha'],
            crm: campos['crm'],
            crmUf: campos['crmUf'],
            especialidade: campos['especialidade'],
            aceitePolitica,
          }
        : {
            tipo,
            nome: campos['nome'],
            email: campos['email'],
            senha: campos['senha'],
            instituicaoNome: campos['instituicaoNome'],
            cnpj: campos['cnpj'],
            aceitePolitica,
          };

    // Mesmo schema que a api usa no servidor (ADR-005).
    const validado = CadastroRequest.safeParse(bruto);

    if (!validado.success) {
      setErrosDeCampo(
        Object.fromEntries(validado.error.issues.map((i) => [String(i.path[0] ?? ''), i.message])),
      );
      return;
    }

    setEnviando(true);
    try {
      const sessao = await api.cadastrar(validado.data);
      aoEntrar(sessao.usuario);
    } catch (e) {
      setErro(
        e instanceof ErroDaApi ? e.message : 'Não foi possível criar a conta. Tente novamente.',
      );
    } finally {
      setEnviando(false);
    }
  }

  function Erro({ nome }: { nome: string }): React.JSX.Element | null {
    const mensagem = errosDeCampo[nome];
    return mensagem === undefined ? null : (
      <p id={`erro-${nome}`} className="text-xs text-vazio">
        {mensagem}
      </p>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <header>
          <MarcaDoApp />
          <h1
            className="mt-6 text-2xl font-extrabold tracking-tight text-gelo"
            style={{ fontFamily: 'var(--font-sinal)' }}
          >
            Criar conta
          </h1>
        </header>

        <div role="radiogroup" aria-label="Tipo de conta" className="grid grid-cols-2 gap-2">
          {(
            [
              ['MEDICO', 'Sou médico'],
              ['INSTITUICAO', 'Represento uma instituição'],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={tipo === valor}
              onClick={() => {
                setTipo(valor);
                setErrosDeCampo({});
              }}
              className={cn(
                'rounded-lg border px-3 py-3 text-left text-sm font-medium transition-colors',
                tipo === valor
                  ? 'border-turno bg-turno-fundo text-turno'
                  : 'border-borda bg-tinta-2 text-gelo-2 hover:bg-tinta-3',
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void enviar(e)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="nome">{tipo === 'MEDICO' ? 'Nome completo' : 'Seu nome'}</Label>
            <Input
              id="nome"
              autoComplete="name"
              {...campo('nome')}
              aria-invalid={errosDeCampo['nome'] !== undefined}
            />
            <Erro nome="nome" />
          </div>

          {tipo === 'MEDICO' ? (
            <>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <div className="space-y-2">
                  <Label htmlFor="crm">CRM</Label>
                  <Input
                    id="crm"
                    inputMode="numeric"
                    {...campo('crm')}
                    aria-invalid={errosDeCampo['crm'] !== undefined}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crmUf">UF</Label>
                  <select
                    id="crmUf"
                    {...campo('crmUf')}
                    className="flex h-12 w-full rounded-lg border border-borda bg-tinta-2 px-3 text-base text-gelo"
                  >
                    {UfBrasileira.options.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Erro nome="crm" />

              <div className="space-y-2">
                <Label htmlFor="especialidade">Especialidade</Label>
                <Input
                  id="especialidade"
                  placeholder="Ex.: Clínica Médica"
                  {...campo('especialidade')}
                />
                <Erro nome="especialidade" />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="instituicaoNome">Nome da instituição</Label>
                <Input id="instituicaoNome" {...campo('instituicaoNome')} />
                <Erro nome="instituicaoNome" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  {...campo('cnpj')}
                />
                <Erro nome="cnpj" />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              {...campo('email')}
            />
            <Erro nome="email" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" autoComplete="new-password" {...campo('senha')} />
            <Erro nome="senha" />
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm text-gelo-2">
              <input
                type="checkbox"
                checked={aceitou}
                onChange={(e) => setAceitou(e.target.checked)}
                disabled={politica === null}
                aria-invalid={errosDeCampo['aceitePolitica'] !== undefined}
                className="mt-0.5 size-5 shrink-0 accent-turno"
              />
              <span>
                Li e aceito a{' '}
                <button
                  type="button"
                  className="font-medium text-turno underline underline-offset-2"
                  onClick={() => setLendoPolitica(true)}
                  disabled={politica === null}
                >
                  política de privacidade
                </button>
                .
              </span>
            </label>
            <Erro nome="aceitePolitica" />
          </div>

          <ErroDeFormulario mensagem={erro} />

          <Button type="submit" tamanho="grande" className="w-full" disabled={enviando}>
            {enviando ? 'Criando conta…' : 'Criar conta'}
          </Button>

          <Button type="button" variante="discreto" className="w-full" onClick={aoVoltar}>
            Já tenho conta
          </Button>
        </form>
      </div>

      {lendoPolitica && politica !== null ? (
        <Painel titulo="Política de privacidade" aoFechar={() => setLendoPolitica(false)}>
          <PoliticaDePrivacidade politica={politica} />
          <Button
            className="mt-5 w-full"
            onClick={() => {
              setAceitou(true);
              setLendoPolitica(false);
            }}
          >
            Aceitar
          </Button>
        </Painel>
      ) : null}
    </main>
  );
}
