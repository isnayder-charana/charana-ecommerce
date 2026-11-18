import 'server-only';
import { cookies } from 'next/headers';
import { type CartLine, cartSchema } from './cart';

const COOKIE_NAME = 'ct_cart';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Lee el carrito de la cookie. Si alguien la modificó a mano y no tiene la forma correcta,
 * se trata como un carrito vacío (nunca rompe la página).
 */
export async function readCart(): Promise<CartLine[]> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return [];
  try {
    const parsed = cartSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Guarda el carrito. Solo se puede llamar desde una Server Action o un Route Handler. */
export async function writeCart(lines: CartLine[]): Promise<void> {
  const store = await cookies();
  if (lines.length === 0) {
    store.delete(COOKIE_NAME);
    return;
  }
  store.set(COOKIE_NAME, JSON.stringify(lines), {
    httpOnly: true, // JavaScript del navegador no la puede leer: protege ante ataques XSS
    sameSite: 'lax', // no se envía en peticiones que otros sitios disparen (protección CSRF)
    secure: process.env.NODE_ENV === 'production', // en producción, solo por HTTPS
    path: '/',
    maxAge: THIRTY_DAYS, // el carrito sobrevive aunque cierres el navegador
  });
}
