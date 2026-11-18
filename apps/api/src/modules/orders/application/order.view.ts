import type { Order } from '../domain/index.js';

export interface OrderView {
  id: string;
  status: string;
  lines: {
    productId: string;
    sku: string;
    name: string;
    unitPrice: { cents: number; currency: string };
    quantity: number;
    subtotal: { cents: number; currency: string };
  }[];
  total: { cents: number; currency: string };
  history: { status: string; at: string }[];
  createdAt: string;
}

export function toOrderView(order: Order): OrderView {
  const p = order.toPrimitives();
  return {
    id: p.id,
    status: p.status,
    lines: order.lines.map((line) => {
      const l = line.toPrimitives();
      return {
        productId: l.productId,
        sku: l.sku,
        name: l.name,
        unitPrice: { cents: l.unitPriceCents, currency: l.currency },
        quantity: l.quantity,
        subtotal: { cents: line.subtotal.cents, currency: line.subtotal.currency },
      };
    }),
    total: { cents: p.totalCents, currency: p.currency },
    history: p.history,
    createdAt: p.createdAt,
  };
}
