import type { UseCase } from '../../../shared/application/use-case.js';
import type { OrderRepository } from './order.repository.js';
import { type OrderView, toOrderView } from './order.view.js';

export class ListMyOrdersUseCase implements UseCase<{ customerId: string }, OrderView[]> {
  constructor(private readonly orders: OrderRepository) {}

  async execute({ customerId }: { customerId: string }): Promise<OrderView[]> {
    const orders = await this.orders.findByCustomer(customerId);
    return orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(toOrderView);
  }
}
