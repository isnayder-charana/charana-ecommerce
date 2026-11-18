import type { UseCase } from '../../../shared/application/use-case.js';
import { OrderNotFoundError } from '../domain/index.js';
import type { OrderRepository } from './order.repository.js';
import { type OrderView, toOrderView } from './order.view.js';

export class GetOrderUseCase implements UseCase<{ id: string; customerId: string }, OrderView> {
  constructor(private readonly orders: OrderRepository) {}

  async execute({ id, customerId }: { id: string; customerId: string }): Promise<OrderView> {
    const order = await this.orders.findById(id);
    // Si el pedido es de otro cliente respondemos "no existe" (no revelamos que existe).
    if (!order?.isOwnedBy(customerId)) throw new OrderNotFoundError(id);
    return toOrderView(order);
  }
}
