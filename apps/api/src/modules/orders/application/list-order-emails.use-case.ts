import type { UseCase } from '../../../shared/application/use-case.js';
import { OrderNotFoundError } from '../domain/index.js';
import type { OrderEmailView, OrderEmailsReader } from './order-emails.js';
import type { OrderRepository } from './order.repository.js';

type Input = { id: string; customerId: string };

/** Los correos de uno de MIS pedidos. Igual que GetOrder: si no es mío, "no existe". */
export class ListOrderEmailsUseCase implements UseCase<Input, OrderEmailView[]> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly emails: OrderEmailsReader,
  ) {}

  async execute({ id, customerId }: Input): Promise<OrderEmailView[]> {
    const order = await this.orders.findById(id);
    if (!order?.isOwnedBy(customerId)) throw new OrderNotFoundError(id);
    return this.emails.findByOrder(id);
  }
}
