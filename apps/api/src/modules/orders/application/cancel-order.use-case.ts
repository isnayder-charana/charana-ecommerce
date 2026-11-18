import type { UseCase } from '../../../shared/application/use-case.js';
import { OrderNotFoundError } from '../domain/index.js';
import type { OrderRepository } from './order.repository.js';
import { type OrderView, toOrderView } from './order.view.js';
import type { PaymentGateway } from './payment.gateway.js';
import type { StockGateway } from './stock.gateway.js';

export class CancelOrderUseCase implements UseCase<{ id: string; customerId: string }, OrderView> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly stock: StockGateway,
    private readonly payments: PaymentGateway,
    private readonly clock: () => Date,
  ) {}

  async execute({ id, customerId }: { id: string; customerId: string }): Promise<OrderView> {
    const order = await this.orders.findById(id);
    if (!order?.isOwnedBy(customerId)) throw new OrderNotFoundError(id);

    const wasPaid = order.status === 'PAID';
    order.cancel(this.clock()); // el dominio decide si se puede cancelar

    // Primero la pasarela, después guardar. Si guardar falla, el cliente reintenta
    // y el reembolso NO se repite: la pasarela lo hace idempotente por sesión.
    if (order.paymentSessionId) {
      if (wasPaid) await this.payments.refundCheckout(order.paymentSessionId);
      else await this.payments.expireCheckout(order.paymentSessionId); // que ya no se pueda pagar
    }

    await this.orders.save(order);
    await this.stock.release(
      order.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    );
    return toOrderView(order);
  }
}
