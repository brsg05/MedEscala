import { cn } from '@/lib/utils';

export type EstadoDoElo = 'concluido' | 'aguardando' | 'pendente' | 'recusado';

export interface Elo {
  papel: 'TITULAR' | 'SUBSTITUTO' | 'INSTITUIÇÃO';
  nome: string | null;
  /** CRM do médico ou CNPJ da instituição — o identificador que formaliza a parte. */
  registro: string | null;
  acao: string;
  /** Carimbo de tempo do ato, já formatado. Nulo enquanto o ato não ocorreu. */
  em: string | null;
  estado: EstadoDoElo;
}

const APARENCIA: Record<
  EstadoDoElo,
  { ponto: string; anel: string; texto: string; marca: string }
> = {
  concluido: { ponto: 'bg-turno', anel: 'ring-turno/30', texto: 'text-turno', marca: '✓' },
  aguardando: { ponto: 'bg-espera', anel: 'ring-espera/30', texto: 'text-espera', marca: '⧗' },
  pendente: { ponto: 'bg-borda', anel: 'ring-transparent', texto: 'text-gelo-3', marca: '·' },
  recusado: { ponto: 'bg-vazio', anel: 'ring-vazio/30', texto: 'text-vazio', marca: '✕' },
};

/**
 * Cadeia tríade — o segundo elemento-assinatura.
 *
 * A Entrega 1 (§5.1) é categórica: o repasse é **triádico**, não bilateral. O
 * acordo entre dois médicos por mensagem não produz efeito; a substituição só vale
 * registrada na escala e autorizada pela chefia, e até lá o titular permanece
 * responsável. Essa é a RN01 e a razão de existir do produto.
 *
 * Por isso a cadeia não é um "stepper" genérico de progresso: os três elos são
 * sempre os mesmos três papéis, sempre visíveis, mesmo quando vazios. O elo da
 * instituição não some por estar pendente — a ausência dele É a informação.
 */
export function CadeiaTriade({
  elos,
  className,
}: {
  elos: readonly [Elo, Elo, Elo];
  className?: string;
}): React.JSX.Element {
  return (
    <ol className={cn('relative space-y-0', className)}>
      {elos.map((elo, i) => {
        const aparencia = APARENCIA[elo.estado];
        const ultimo = i === elos.length - 1;

        return (
          <li key={elo.papel} className="relative flex gap-3 pb-5 last:pb-0">
            {!ultimo && (
              <span
                aria-hidden="true"
                className="absolute top-6 bottom-0 left-[0.4375rem] w-px bg-borda"
              />
            )}

            <span
              aria-hidden="true"
              className={cn(
                'dado relative z-10 mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center',
                'rounded-full text-[0.5rem] text-tinta ring-4',
                aparencia.ponto,
                aparencia.anel,
              )}
            >
              {aparencia.marca}
            </span>

            <div className="min-w-0 flex-1">
              <p className="sinal">{elo.papel}</p>

              <p className="mt-0.5 truncate text-sm font-medium text-gelo">
                {elo.nome ?? <span className="text-gelo-3">ainda não indicado</span>}
              </p>

              {elo.registro !== null && (
                <p className="dado mt-0.5 text-[0.6875rem] text-gelo-3">{elo.registro}</p>
              )}

              <p
                className={cn(
                  'mt-1 flex flex-wrap items-baseline gap-x-2 text-xs',
                  aparencia.texto,
                )}
              >
                <span>{elo.acao}</span>
                {elo.em !== null && <span className="dado text-gelo-3">{elo.em}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A regra escrita por extenso, ancorada na cadeia.
 *
 * Fica junto da cadeia sempre que um repasse ainda não terminou: é a diferença
 * entre o médico achar que "já passou o plantão" e saber que ainda responde por ele.
 */
export function AvisoDeResponsabilidade(): React.JSX.Element {
  return (
    <p className="rounded-lg border border-espera/25 bg-espera-fundo px-3 py-2.5 text-xs leading-relaxed text-espera">
      Enquanto a instituição não aprovar, a escala oficial não muda e o médico titular segue
      responsável pelo plantão.
    </p>
  );
}
