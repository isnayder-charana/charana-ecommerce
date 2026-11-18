'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-provider';
import { signInHref } from '@/features/auth/return-to';
import type { SessionUser } from '@/features/auth/session';

/** Muestra `children` solo con sesión; si no, invita a iniciar sesión y volver aquí. */
export function RequireSession({
  returnTo,
  children,
}: {
  returnTo: string;
  children: (user: SessionUser) => ReactNode;
}) {
  const { state } = useAuth();

  if (state.status === 'loading') {
    return (
      <p role="status" className="py-10 text-center text-muted">
        Cargando tu sesión…
      </p>
    );
  }

  if (state.status === 'signedOut') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-5 py-16 text-center">
        <h1 className="text-xl font-bold">Inicia sesión para ver tus pedidos</h1>
        <p className="max-w-sm text-muted">Tus pedidos son privados: solo tú puedes verlos.</p>
        <Link href={signInHref(returnTo)} className={buttonClasses({ className: 'mt-2' })}>
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return children(state.user);
}
