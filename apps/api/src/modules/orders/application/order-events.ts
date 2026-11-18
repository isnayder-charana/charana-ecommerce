import type { DomainEvent } from '../../../shared/domain/index.js';
import type { Order, OrderStatus } from '../domain/index.js';

/** Los tipos de evento que Orders publica hacia afuera (el `detail-type` en EventBridge). */
export const ORDER_EVENT_TYPES = [
  'OrderPlaced',
  'OrderPaid',
  'OrderShipped',
  'OrderDelivered',
  'OrderCancelled',
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

/**
 * Evento de INTEGRACIÓN: lo que otros servicios (los workers) reciben.
 * A diferencia del evento de dominio (solo nombre y fecha), viaja con un id
 * único y una "foto" del pedido, para que el consumidor no tenga que pedir más
 * datos a la API.
 */
export interface OrderEvent {
  /** Id único: los consumidores lo usan para no procesar dos veces el mismo evento. */
  id: string;
  type: OrderEventType;
  occurredAt: string; // ISO 8601
  orderId: string;
  customerId: string;
  /** A dónde avisar al cliente. Falta en pedidos antiguos o sin correo. */
  customerEmail?: string;
  status: OrderStatus;
  total: { cents: number; currency: string };
}

/** Traduce los eventos de dominio de un pedido a eventos de integración. */
export function toOrderEvents(
  order: Order,
  domainEvents: readonly DomainEvent[],
  newId: () => string,
): OrderEvent[] {
  return domainEvents.map((event) => {
    // 'orders.OrderPaid' → 'OrderPaid'
    const type = event.name.slice(event.name.lastIndexOf('.') + 1) as OrderEventType;
    return {
      id: newId(),
      type,
      occurredAt: event.occurredAt.toISOString(),
      orderId: order.id,
      customerId: order.customerId,
      ...(order.customerEmail && { customerEmail: order.customerEmail }),
      status: order.status,
      total: { cents: order.total.cents, currency: order.total.currency },
    };
  });
}

/**
 * PUERTO: la bandeja de salida (outbox). El repositorio de pedidos escribe aquí
 * los eventos EN LA MISMA transacción que el pedido; el relé los lee y publica.
 */
export interface OutboxStore {
  /** Los más antiguos primero. */
  pending(limit: number): Promise<OrderEvent[]>;
  /** Los quita de la bandeja una vez publicados. */
  remove(events: OrderEvent[]): Promise<void>;
}

/** PUERTO: el bus de eventos (EventBridge en AWS y en LocalStack). */
export interface EventPublisher {
  /** Publica todos o lanza error: si falla, los eventos siguen en la bandeja y se reintentan. */
  publish(events: OrderEvent[]): Promise<void>;
}

export const OUTBOX_STORE = Symbol('OutboxStore');
export const EVENT_PUBLISHER = Symbol('EventPublisher');
