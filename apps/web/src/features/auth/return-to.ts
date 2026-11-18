/**
 * A dónde volver después de iniciar sesión (?volver=/carrito).
 *
 * Solo se aceptan rutas internas. Sin esta regla, un enlace como
 * /entrar?volver=https://sitio-falso.com llevaría a la persona, recién
 * autenticada, a otra página: es el ataque de "open redirect".
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}

/** /entrar?volver=<ruta actual>, para volver al mismo lugar después de iniciar sesión. */
export function signInHref(returnTo: string): string {
  const path = safeReturnTo(returnTo);
  return path === '/' ? '/entrar' : `/entrar?volver=${encodeURIComponent(path)}`;
}

// Google sale de la tienda y vuelve por /auth/callback: la ruta se guarda mientras tanto.
const STORAGE_KEY = 'ct_return_to';

export function rememberReturnTo(path: string): void {
  sessionStorage.setItem(STORAGE_KEY, safeReturnTo(path));
}

export function takeReturnTo(): string {
  const path = safeReturnTo(sessionStorage.getItem(STORAGE_KEY));
  sessionStorage.removeItem(STORAGE_KEY);
  return path;
}
