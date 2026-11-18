import { cn } from '@/lib/cn';
import { type OrderStatus, STATUS_LABELS } from './order';

// Colores con función: verde = terminó bien, rojo = cancelado, gris = en camino.
const tones: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-sunken text-ink',
  PAID: 'bg-sunken text-ink',
  SHIPPED: 'bg-sunken text-ink',
  DELIVERED: 'bg-deal/10 text-deal',
  CANCELLED: 'bg-danger/10 text-danger',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded-control px-2 py-0.5 text-xs font-semibold',
        tones[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
