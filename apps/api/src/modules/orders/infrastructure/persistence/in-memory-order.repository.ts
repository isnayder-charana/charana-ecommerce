import { randomUUID } from 'node:crypto';
import { toOrderEvents } from '../../application/order-events.js';
import type { OrderRepository } from '../../application/order.repository.js';
import { ConcurrencyError } from '../../../../shared/domain/index.js';
import { Order, type OrderPrimitives } from '../../domain/index.js';
import { InMemoryOutboxStore } from './in-memory-outbox.store.js';

/**
 * ADAPTADOR en memoria. Sirve para desarrollar y testear sin Docker.
 * Aplica el mismo bloqueo optimista que el adaptador de DynamoDB y, como él,
 * deja los eventos del pedido en la bandeja de salida (outbox) al guardar.
 */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly rows = new Map<string, OrderPrimitives>();

  constructor(readonly outbox: InMemoryOutboxStore = new InMemoryOutboxStore()) {}

  async findById(id: string): Promise<Order | null> {
    const row = this.rows.get(id);
    return row ? Order.fromPrimitives(row) : null;
  }

  async findByCustomer(customerId: string): Promise<Order[]> {
    return [...this.rows.values()]
      .filter((r) => r.customerId === customerId)
      .map((r) => Order.fromPrimitives(r));
  }

  async save(order: Order): Promise<void> {
    if ((this.rows.get(order.id)?.version ?? 0) !== order.version) {
      throw new ConcurrencyError('Order', order.id);
    }
    // Pedido y eventos se guardan juntos (en memoria es trivial; en DynamoDB es una transacción).
    this.rows.set(order.id, { ...order.toPrimitives(), version: order.version + 1 });
    this.outbox.add(toOrderEvents(order, order.pullEvents(), randomUUID));
  }
}
