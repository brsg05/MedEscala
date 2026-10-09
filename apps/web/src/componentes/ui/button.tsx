import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const variantes = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variante: {
        primario: 'bg-turno text-tinta hover:bg-turno/90',
        // Recusar é destrutivo para quem espera do outro lado: nunca é o botão
        // mais fácil de acertar, mas também não se esconde.
        perigo: 'bg-vazio-fundo text-vazio border border-vazio/40 hover:bg-vazio/15',
        contorno: 'border border-borda bg-tinta-2 text-gelo hover:bg-tinta-3',
        discreto: 'text-gelo-2 hover:bg-tinta-2 hover:text-gelo',
      },
      tamanho: {
        // 44px — alvo de toque confortável com o polegar (RNF03).
        padrao: 'h-11 px-4 text-sm',
        grande: 'h-14 px-5 text-base',
        pequeno: 'h-9 px-3 text-sm',
      },
    },
    defaultVariants: { variante: 'primario', tamanho: 'padrao' },
  },
);

export type BotaoProps = ComponentProps<'button'> &
  VariantProps<typeof variantes> & { asChild?: boolean };

export function Button({
  className,
  variante,
  tamanho,
  asChild = false,
  ...props
}: BotaoProps): React.JSX.Element {
  const Componente = asChild ? Slot : 'button';
  return <Componente className={cn(variantes({ variante, tamanho }), className)} {...props} />;
}
