import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const tones = {
  /** Naranja: solo "Más vendido" */
  bestseller: 'bg-badge text-white uppercase tracking-wide',
  /** Verde: descuentos */
  deal: 'bg-deal text-white',
} as const;

export function Badge({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded-[3px] px-1.5 text-[11px] font-bold',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
