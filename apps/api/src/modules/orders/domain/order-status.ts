/**
 * Máquina de estados del pedido. Cada estado dice a cuáles puede pasar.
 *
 *   PENDING_PAYMENT ──pagar──▶ PAID ──enviar──▶ SHIPPED ──entregar──▶ DELIVERED
 *         │                     │
 *         └──────cancelar───────┴──────────▶ CANCELLED
 */
export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};
