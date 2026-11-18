import type { Order } from '../domain/index.js';

/**
 * PUERTO: persistencia de pedidos (memoria o DynamoDB).
 * `save` lanza ConcurrencyError si el pedido cambió desde que se leyó.
 */
export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findByCustomer(customerId: string): Promise<Order[]>;
  save(order: Order): Promise<void>;
}

export const ORDER_REPOSITORY = Symbol('OrderRepository');
