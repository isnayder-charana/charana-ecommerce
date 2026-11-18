import { z } from 'zod';

const moneySchema = z.object({ cents: z.number().int(), currency: z.string() });

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** La respuesta de la API para un pedido (OrderView en apps/api). */
export const orderSchema = z.object({
  id: z.uuid(),
  status: z.enum(ORDER_STATUSES),
  lines: z.array(
    z.object({
      productId: z.string(),
      sku: z.string(),
      name: z.string(),
      unitPrice: moneySchema,
      quantity: z.number().int(),
      subtotal: moneySchema,
    }),
  ),
  total: moneySchema,
  history: z.array(z.object({ status: z.enum(ORDER_STATUSES), at: z.string() })),
  createdAt: z.string(),
});
export const orderListSchema = z.array(orderSchema);

export type Order = z.infer<typeof orderSchema>;

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Pendiente de pago',
  PAID: 'Pagado',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

/** Cómo vuelve el cliente desde Stripe: ?pago=exito o ?pago=cancelado. */
export type PaymentReturn = 'exito' | 'cancelado';

export function parsePaymentReturn(value: string | undefined): PaymentReturn | undefined {
  return value === 'exito' || value === 'cancelado' ? value : undefined;
}

/** La misma regla que la máquina de estados de la API: se cancela antes de enviarse. */
/** Cuántas veces preguntamos, como máximo, por la confirmación de Stripe (cada 2 s = 1 minuto). */
export const MAX_PAYMENT_CHECKS = 30;
/** Cada cuánto miramos un pedido que el almacén está moviendo (paso 25). */
export const FULFILLMENT_CHECK_MS = 5000;

/**
 * Cada cuánto volver a pedir el pedido a la API (false = no volver a pedirlo).
 * - Vuelta de Stripe y aún pendiente: cada 2 s hasta ver el pago (el webhook tarda segundos).
 * - Pagado o enviado: el almacén lo avanza solo; cada 5 s para ver Enviado y Entregado.
 * - Entregado, cancelado o pendiente normal: ya no cambia solo, no se pregunta.
 */
export function refreshInterval(
  status: OrderStatus | undefined,
  payment: PaymentReturn | undefined,
  checksSoFar: number,
): number | false {
  if (status === 'PENDING_PAYMENT') {
    return payment === 'exito' && checksSoFar < MAX_PAYMENT_CHECKS ? 2000 : false;
  }
  return status === 'PAID' || status === 'SHIPPED' ? FULFILLMENT_CHECK_MS : false;
}

export function canCancel(order: Pick<Order, 'status'>): boolean {
  return order.status === 'PENDING_PAYMENT' || order.status === 'PAID';
}

/** Número corto para mostrar: los primeros 8 caracteres del id, en mayúsculas. */
export function orderNumber(order: Pick<Order, 'id'>): string {
  return order.id.slice(0, 8).toUpperCase();
}

export function countUnits(order: Pick<Order, 'lines'>): number {
  return order.lines.reduce((sum, line) => sum + line.quantity, 0);
}

const dateFormat = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Lima',
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}
