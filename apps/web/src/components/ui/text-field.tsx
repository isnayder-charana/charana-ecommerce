import { type ComponentProps, useId } from 'react';
import { cn } from '@/lib/cn';

type TextFieldProps = ComponentProps<'input'> & {
  label: string;
  /** Mensaje de error de la validación; también se anuncia a lectores de pantalla. */
  error?: string;
  hint?: string;
};

/** Campo de formulario con etiqueta, ayuda y error conectados por id (accesible). */
export function TextField({ label, error, hint, className, ...props }: TextFieldProps) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'h-11 rounded-control border border-line bg-surface px-3 text-sm placeholder:text-muted focus:border-action focus:outline-none focus:ring-1 focus:ring-action',
          error && 'border-danger focus:border-danger focus:ring-danger',
          className,
        )}
        {...props}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
