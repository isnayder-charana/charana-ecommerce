import type { ReactNode } from 'react';

/** El bloque blanco centrado de /entrar, /registro y /auth/callback. */
export function AuthCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm rounded-card bg-surface px-5 py-7 sm:px-7">
      {title && <h1 className="mb-5 text-xl font-bold">{title}</h1>}
      {children}
    </div>
  );
}

/** Línea "o" entre Google y el formulario de correo. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
    </div>
  );
}
