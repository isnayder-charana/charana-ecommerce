import type { OrderEvent, OutboxStore } from '../../application/order-events.js';

/** ADAPTADOR en memoria de la bandeja de salida. El repositorio en memoria escribe aquí. */
export class InMemoryOutboxStore implements OutboxStore {
  private readonly events = new Map<string, OrderEvent>();

  /** Lo usa el repositorio al guardar un pedido. */
  add(events: OrderEvent[]): void {
    for (const event of events) this.events.set(event.id, event);
  }

  async pending(limit: number): Promise<OrderEvent[]> {
    return [...this.events.values()]
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .slice(0, limit);
  }

  async remove(events: OrderEvent[]): Promise<void> {
    for (const event of events) this.events.delete(event.id);
  }
}
