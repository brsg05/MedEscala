import { useState, type FormEvent } from 'react';
import { CadastroRequest, UfBrasileira, type UsuarioAutenticado } from '@medescala/contracts';
import { api, ErroDaApi } from '@/api/cliente';
import { MarcaDoApp } from '@/componentes/AppShell';
import { ErroDeFormulario } from '@/componentes/Painel';
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
          }
        : {
            tipo,
            nome: campos['nome'],
            email: campos['email'],
            senha: campos['senha'],
            instituicaoNome: campos['instituicaoNome'],
            cnpj: campos['cnpj'],
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

          <p className="rounded-lg border border-espera/25 bg-espera-fundo px-3 py-2.5 text-xs leading-relaxed text-espera">
            {tipo === 'MEDICO'
              ? 'Seu CRM é conferido pela plataforma antes de você poder ser escalado. Até lá, você já pode declarar disponibilidade.'
              : 'O CNPJ é conferido pela plataforma antes de a instituição publicar vagas. Até lá, você já pode montar unidades e setores.'}
          </p>

          <ErroDeFormulario mensagem={erro} />

          <Button type="submit" tamanho="grande" className="w-full" disabled={enviando}>
            {enviando ? 'Criando conta…' : 'Criar conta'}
          </Button>

          <Button type="button" variante="discreto" className="w-full" onClick={aoVoltar}>
            Já tenho conta
          </Button>
        </form>
      </div>
    </main>
  );
}
