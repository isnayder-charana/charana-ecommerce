'use server';

import { readCart, writeCart } from '@/features/cart/cart-cookie';
import { apiRequest } from '@/lib/api-client';
import { type CheckoutResult, checkoutFailure } from './checkout';
import { orderSchema } from './order';

/**
 * SERVER ACTION: crea el pedido con lo que hay en el carrito (la cookie httpOnly
 * solo se puede leer aquí, en el servidor).
 *
 * El navegador envía el access token y el servidor lo reenvía a la API, que es
 * quien lo verifica: esta acción no decide quién es el cliente. Tampoco envía
 * precios: la API los toma del catálogo y reserva el stock.
 *
 * El ID token (opcional) viaja en X-Id-Token: la API verifica su firma y que sea
 * de la misma persona, y guarda el correo en el pedido para avisarle (paso 24).
 */
export async function placeOrderFromCart(
  token: string,
  idToken?: string | null,
): Promise<CheckoutResult> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 8192) {
    return { ok: false, reason: 'signin', message: 'Inicia sesión para continuar.' };
  }

  const items = await readCart();
  if (items.length === 0) {
    return { ok: false, reason: 'error', message: 'Tu carrito está vacío.' };
  }

  try {
    const order = await apiRequest('/orders', orderSchema, {
      method: 'POST',
      body: { items },
      token,
      headers: isToken(idToken) ? { 'X-Id-Token': idToken } : undefined,
    });
    // Solo si la API confirmó el pedido se vacía el carrito.
    await writeCart([]);
    return { ok: true, orderId: order.id };
  } catch (error) {
    return checkoutFailure(error);
  }
}

/** Lo que llega a una Server Action viene del navegador: se revisa antes de usarlo. */
function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 8192;
}
