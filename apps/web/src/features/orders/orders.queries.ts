import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiRequest } from '@/lib/api-client';
import { orderEmailListSchema, orderListSchema, orderSchema } from './order';

type GetToken = () => Promise<string | null>;

/**
 * Los pedidos son PRIVADOS: cada petición lleva el access token de la sesión.
 * El id del usuario va en la queryKey para que, si cambia la sesión, nunca se
 * muestren en pantalla los pedidos guardados en caché de otra persona.
 */
export const myOrdersQuery = (userId: string, getToken: GetToken) =>
  queryOptions({
    queryKey: ['orders', userId],
    queryFn: async ({ signal }) =>
      apiRequest('/orders', orderListSchema, { token: await getToken(), signal }),
  });

export const orderQuery = (userId: string, id: string, getToken: GetToken) =>
  queryOptions({
    queryKey: ['orders', userId, id],
    queryFn: async ({ signal }) =>
      apiRequest(`/orders/${id}`, orderSchema, { token: await getToken(), signal }),
    retry: (failureCount, error) => !isClientError(error) && failureCount < 1,
  });

/**
 * Los correos del pedido. `expected` va en la queryKey: cuando el pedido cambia
 * de estado se pide la lista otra vez, sin esperar al siguiente intervalo.
 */
export const orderEmailsQuery = (
  userId: string,
  id: string,
  expected: number,
  getToken: GetToken,
) =>
  queryOptions({
    queryKey: ['orders', userId, id, 'emails', expected],
    queryFn: async ({ signal }) =>
      apiRequest(`/orders/${id}/emails`, orderEmailListSchema, {
        token: await getToken(),
        signal,
      }),
    retry: false,
  });

export async function cancelOrder(id: string, getToken: GetToken) {
  return apiRequest(`/orders/${id}/cancel`, orderSchema, {
    method: 'POST',
    token: await getToken(),
  });
}

const checkoutSchema = z.object({ url: z.url({ protocol: /^https$/ }) });

/**
 * Pide a la API la página de pago de Stripe. Solo mandamos el id del pedido:
 * el monto lo calcula el servidor con los precios guardados.
 */
export async function startCheckout(id: string, getToken: GetToken) {
  return apiRequest(`/orders/${id}/checkout`, checkoutSchema, {
    method: 'POST',
    token: await getToken(),
  });
}

/** 4xx: reintentar no lo arregla (no existe, no es tuyo, sesión vencida…). */
export function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}
