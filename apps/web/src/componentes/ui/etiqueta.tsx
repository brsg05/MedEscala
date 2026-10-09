import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Etiqueta de estado de cobertura.
 *
 * As variantes são os estados reais do domínio, não tamanhos de ênfase. Não há
 * variante "info" ou "sucesso" de propósito: se um estado novo precisar de cor,
 * ele primeiro precisa existir na máquina de estados do §7.3.
 */
const variantes = cva(
  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider',
  {
    variants: {
      estado: {
        turno: 'bg-turno-fundo text-turno',
        vazio: 'bg-vazio-fundo text-vazio',
        repasse: 'bg-repasse-fundo text-repasse',
        espera: 'bg-espera-fundo text-espera',
        neutro: 'bg-tinta-3 text-gelo-2',
      },
    },
    defaultVariants: { estado: 'neutro' },
  },
);

export type EtiquetaProps = ComponentProps<'span'> & VariantProps<typeof variantes>;

export function Etiqueta({ className, estado, ...props }: EtiquetaProps): React.JSX.Element {
  return <span className={cn(variantes({ estado }), className)} {...props} />;
}
