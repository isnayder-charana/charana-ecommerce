import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Mensaje arriba de un formulario. role="alert" hace que el lector de pantalla lo lea al aparecer. */
export function FormAlert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-control px-3 py-2.5 text-sm',
        tone === 'error' && 'bg-danger/10 text-danger',
        tone === 'success' && 'bg-deal/10 text-ink',
        tone === 'info' && 'bg-sunken text-ink',
      )}
    >
      {children}
    </p>
  );
}
