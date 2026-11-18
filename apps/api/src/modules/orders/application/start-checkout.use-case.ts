import type { UseCase } from '../../../shared/application/use-case.js';
import { OrderNotFoundError, OrderNotPayableError } from '../domain/index.js';
import type { OrderRepository } from './order.repository.js';
import type { PaymentGateway } from './payment.gateway.js';

export interface StartCheckoutInput {
  id: string;
  customerId: string;
}

export interface CheckoutConfig {
  /** Dirección pública de la tienda, para armar las URLs de vuelta. */
  storeUrl: string;
  /** Minutos que el cliente tiene para pagar (Stripe exige al menos 30). */
  paymentWindowMinutes: number;
}

/**
 * Abre (o reutiliza) la página de pago de un pedido y devuelve su URL.
 * El navegador solo recibe la URL: el monto lo calcula el servidor con los
 * precios guardados en el pedido, así nadie puede pagar menos editando la página.
 */
export class StartCheckoutUseCase implements UseCase<StartCheckoutInput, { url: string }> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly payments: PaymentGateway,
    private readonly clock: () => Date,
    private readonly config: CheckoutConfig,
  ) {}

  async execute({ id, customerId }: StartCheckoutInput): Promise<{ url: string }> {
    const order = await this.orders.findById(id);
    if (!order?.isOwnedBy(customerId)) throw new OrderNotFoundError(id);
    if (!order.isPayable) throw new OrderNotPayableError(id, order.status);

    // ¿Ya tiene una sesión abierta? La reutilizamos: una sola página de pago por pedido.
    if (order.paymentSessionId) {
      const open = await this.payments.findOpenCheckout(order.paymentSessionId);
      if (open) return { url: open.url };
    }

    const now = this.clock();
    const orderUrl = `${this.config.storeUrl}/pedidos/${order.id}`;
    const session = await this.payments.createCheckout({
      orderId: order.id,
      currency: order.total.currency,
      lines: order.lines.map((line) => {
        const l = line.toPrimitives();
        return { name: l.name, unitPriceCents: l.unitPriceCents, quantity: l.quantity };
      }),
      successUrl: `${orderUrl}?pago=exito`,
      cancelUrl: `${orderUrl}?pago=cancelado`,
      expiresAt: new Date(now.getTime() + this.config.paymentWindowMinutes * 60_000),
    });

    order.attachPaymentSession(session.id);
    // Si dos clics llegan a la vez, el bloqueo optimista deja pasar solo uno (el otro recibe 409).
    await this.orders.save(order);
    return { url: session.url };
  }
}
