import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: ComponentProps<'input'>): React.JSX.Element {
  return (
    <input
      className={cn(
        'flex h-12 w-full rounded-lg border border-borda bg-tinta-2 px-3.5',
        // 16px evita o zoom automático do iOS ao focar um campo.
        'text-base text-gelo placeholder:text-gelo-3',
        'transition-colors focus:border-turno focus:bg-tinta-3',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-vazio',
        className,
      )}
      {...props}
    />
  );
}
