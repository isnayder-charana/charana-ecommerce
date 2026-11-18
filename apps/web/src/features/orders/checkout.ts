import { ApiError } from '@/lib/api-client';

export type CheckoutResult =
  { ok: true; orderId: string } | { ok: false; reason: 'signin' | 'error'; message: string };

/** Convierte el error de la API al crear un pedido en algo que la persona pueda resolver. */
export function checkoutFailure(error: unknown): Extract<CheckoutResult, { ok: false }> {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { ok: false, reason: 'signin', message: 'Tu sesión venció. Vuelve a iniciar sesión.' };
    }
    if (error.code === 'INSUFFICIENT_STOCK') {
      return {
        ok: false,
        reason: 'error',
        message: 'Uno de los productos ya no tiene stock suficiente. Revisa tu carrito.',
      };
    }
    if (error.code === 'PRODUCT_NOT_FOUND') {
      return {
        ok: false,
        reason: 'error',
        message: 'Uno de los productos ya no está a la venta. Quítalo del carrito para continuar.',
      };
    }
  }
  return {
    ok: false,
    reason: 'error',
    message: 'No pudimos crear el pedido. Inténtalo otra vez en unos segundos.',
  };
}
