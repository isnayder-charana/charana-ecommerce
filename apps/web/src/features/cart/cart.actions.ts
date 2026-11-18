'use server';

import { z } from 'zod';
import { apiGet } from '@/lib/api-client';
import { productSchema } from '@/features/catalog/product';
import { addLine, MAX_CART_LINES, MAX_QUANTITY, setLineQuantity } from './cart';
import { readCart, writeCart } from './cart-cookie';

/**
 * SERVER ACTIONS: funciones que corren en el servidor pero se llaman desde un botón del
 * navegador como si fueran locales. Next arma la petición HTTP por nosotros.
 * Como cualquiera podría llamarlas con datos inventados, validan TODO lo que reciben.
 */

export type CartActionResult = { ok: true } | { ok: false; message: string };

const inputSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(0).max(MAX_QUANTITY),
});

export async function addToCart(productId: string, quantity: number): Promise<CartActionResult> {
  const input = inputSchema.safeParse({ productId, quantity });
  if (!input.success || input.data.quantity === 0) {
    return { ok: false, message: 'Datos inválidos.' };
  }

  // Confirmamos con la API que el producto existe y tiene stock.
  const product = await apiGet(`/products/${input.data.productId}`, productSchema).catch(
    () => null,
  );
  if (!product) return { ok: false, message: 'Este producto ya no está disponible.' };

  const lines = await readCart();
  const current = lines.find((line) => line.productId === product.id)?.quantity ?? 0;
  if (current + input.data.quantity > MAX_QUANTITY) {
    return {
      ok: false,
      message: `Máximo ${MAX_QUANTITY} unidades por producto (ya tienes ${current} en el carrito).`,
    };
  }
  if (current + input.data.quantity > product.stock) {
    return { ok: false, message: `Solo quedan ${product.stock} unidades de este producto.` };
  }
  if (!current && lines.length >= MAX_CART_LINES) {
    return { ok: false, message: `El carrito admite hasta ${MAX_CART_LINES} productos distintos.` };
  }

  // Cambiar una cookie dentro de una Server Action hace que Next vuelva a dibujar la página:
  // el contador de la cabecera se actualiza solo.
  await writeCart(addLine(lines, product.id, input.data.quantity));
  return { ok: true };
}

export async function updateCartQuantity(
  productId: string,
  quantity: number,
): Promise<CartActionResult> {
  const input = inputSchema.safeParse({ productId, quantity });
  if (!input.success) return { ok: false, message: 'Datos inválidos.' };

  await writeCart(setLineQuantity(await readCart(), input.data.productId, input.data.quantity));
  return { ok: true };
}

export async function removeFromCart(productId: string): Promise<CartActionResult> {
  return updateCartQuantity(productId, 0);
}
