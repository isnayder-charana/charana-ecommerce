import type { OrderEmailView, OrderEmailsReader } from '../../application/order-emails.js';

/**
 * ADAPTADOR en memoria. Sin base de datos no corren los workers, así que no hay
 * correos que mostrar; `add` existe para los tests.
 */
export class InMemoryOrderEmailsReader implements OrderEmailsReader {
  private readonly emails = new Map<string, OrderEmailView[]>();

  add(orderId: string, email: OrderEmailView): void {
    this.emails.set(orderId, [...(this.emails.get(orderId) ?? []), email]);
  }

  async findByOrder(orderId: string): Promise<OrderEmailView[]> {
    return [...(this.emails.get(orderId) ?? [])].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    );
  }
}
