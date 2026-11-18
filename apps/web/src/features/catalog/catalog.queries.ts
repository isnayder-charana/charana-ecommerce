import { queryOptions } from '@tanstack/react-query';
import { ApiError, apiGet } from '@/lib/api-client';
import { productListSchema, productSchema } from './product';

export type ProductFilters = {
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
};

/**
 * Todo lo que TanStack Query necesita para pedir productos:
 * - queryKey: el "nombre" del dato en la caché. Incluye los filtros, así cada búsqueda
 *   se guarda por separado y volver a una ya vista es instantáneo.
 * - queryFn: cómo traerlo. `signal` cancela la petición si el usuario cambia de página.
 */
export const productsQuery = (filters: ProductFilters = {}) =>
  queryOptions({
    queryKey: ['products', filters],
    queryFn: ({ signal }) => apiGet('/products', productListSchema, filters, { signal }),
  });

/** Un producto por id (página de detalle). */
export const productQuery = (id: string) =>
  queryOptions({
    queryKey: ['product', id],
    queryFn: ({ signal }) => apiGet(`/products/${id}`, productSchema, {}, { signal }),
    // Reintentar no sirve si el producto no existe: solo se reintentan fallos de red o 5xx.
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
  });

/** 404 (no existe) o 400 (el id ni siquiera es un UUID válido): para el usuario es lo mismo. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 400);
}
