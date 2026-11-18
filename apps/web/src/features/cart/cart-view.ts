import 'server-only';
import { isNotFound } from '@/features/catalog/catalog.queries';
import { type Product, productSchema } from '@/features/catalog/product';
import { apiGet } from '@/lib/api-client';
import type { CartLine } from './cart';

export type CartItem =
  { status: 'ok'; line: CartLine; product: Product } | { status: 'unavailable'; line: CartLine };

/**
 * Junta lo que hay en la cookie (id + cantidad) con los datos ACTUALES de la API
 * (nombre, precio, stock). Pide todos los productos a la vez con Promise.all.
 */
export async function loadCartItems(lines: CartLine[]): Promise<CartItem[]> {
  return Promise.all(
    lines.map(async (line): Promise<CartItem> => {
      try {
        const product = await apiGet(`/products/${line.productId}`, productSchema);
        return { status: 'ok', line, product };
      } catch (error) {
        // Si el producto se eliminó lo marcamos; cualquier otro error (API caída) se propaga.
        if (isNotFound(error)) return { status: 'unavailable', line };
        throw error;
      }
    }),
  );
}
