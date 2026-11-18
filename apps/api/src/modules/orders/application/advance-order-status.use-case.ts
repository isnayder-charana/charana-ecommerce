import type { UseCase } from '../../../shared/application/use-case.js';
import { OrderNotFoundError } from '../domain/index.js';
import type { OrderRepository } from './order.repository.js';
import { type OrderView, toOrderView } from './order.view.js';

export const ORDER_ACTIONS = ['pay', 'ship', 'deliver'] as const;
export type OrderAction = (typeof ORDER_ACTIONS)[number];

/**
 * Avanza el estado del pedido. Hoy lo usa un administrador; en la fase 3
 * "pay" lo disparará el webhook de Stripe.
 */
export class AdvanceOrderStatusUseCase implements UseCase<
  { id: string; action: OrderAction },
  OrderView
> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly clock: () => Date,
  ) {}

  async execute({ id, action }: { id: string; action: OrderAction }): Promise<OrderView> {
    const order = await this.orders.findById(id);
    if (!order) throw new OrderNotFoundError(id);

    const now = this.clock();
    if (action === 'pay') order.markPaid(now);
    else if (action === 'ship') order.ship(now);
    else order.deliver(now);

    await this.orders.save(order);
    return toOrderView(order);
  }
}
