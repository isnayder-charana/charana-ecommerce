'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from './auth-provider';
import { signInHref } from './return-to';
import { firstName } from './session';

/** Cabecera: "Entrar" sin sesión, o el nombre de la persona y "Salir". */
export function AccountMenu() {
  const { state, signOut } = useAuth();
  const pathname = usePathname();
  const query = useSearchParams().toString();

  if (state.status === 'loading') {
    // Mismo ancho que "Entrar" para que la cabecera no salte al terminar de cargar.
    return <span aria-hidden="true" className="h-5 w-12 animate-pulse rounded bg-sunken" />;
  }

  if (state.status === 'signedOut') {
    // En /entrar y /registro no tiene sentido "volver" a ellas mismas.
    const here =
      pathname.startsWith('/entrar') || pathname.startsWith('/registro') ? '/' : pathname;
    return (
      <Link
        href={signInHref(query && here !== '/' ? `${here}?${query}` : here)}
        className="text-sm font-semibold hover:text-action"
      >
        Entrar
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="max-w-32 truncate font-semibold" title={state.user.email}>
        Hola, {firstName(state.user)}
      </span>
      <Link href="/pedidos" className="hover:text-action hover:underline">
        Mis pedidos
      </Link>
      <button
        type="button"
        onClick={() => void signOut()}
        className="text-muted hover:text-action hover:underline"
      >
        Salir
      </button>
    </div>
  );
}
