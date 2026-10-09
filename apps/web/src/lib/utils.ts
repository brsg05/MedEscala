import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Helper padrão do shadcn/ui: combina classes e resolve conflitos do Tailwind. */
export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas));
}
