import type { UseCase } from '../../../shared/application/use-case.js';
import type { PaymentEvent, ProcessedEventStore } from './payment-event.js';
import type { OrderRepository } from './order.repository.js';
import type { PaymentGateway } from './payment.gateway.js';
import type { StockGateway } from './stock.gateway.js';

/** Qué hicimos con el aviso. Se registra en el log y ayuda en los tests. */
export type PaymentEventOutcome =
  | 'paid' // el pedido pasó a PAID
  | 'expired' // nadie pagó a tiempo: pedido cancelado y stock devuelto
  | 'refunded' // llegó un pago para un pedido ya cancelado: devolvimos el dinero
  | 'duplicate' // ya lo habíamos procesado
  | 'ignored'; // no aplica (pedido inexistente, ya pagado, sesión vieja…)

/**
 * Reacciona a los avisos de la pasarela de pagos. Es IDEMPOTENTE:
 * procesar el mismo aviso dos veces deja todo igual que procesarlo una.
 */
export class HandlePaymentEventUseCase implements UseCase<PaymentEvent, PaymentEventOutcome> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly stock: StockGateway,
    private readonly payments: PaymentGateway,
    private readonly processed: ProcessedEventStore,
    private readonly clock: () => Date,
  ) {}

  async execute(event: PaymentEvent): Promise<PaymentEventOutcome> {
    if (await this.processed.has(event.id)) return 'duplicate';

    const outcome =
      event.type === 'payment_succeeded'
        ? await this.paymentSucceeded(event)
        : await this.checkoutExpired(event);

    // Se registra DESPUÉS de procesar: si algo falla antes, respondemos error,
    // la pasarela reintenta y el aviso se procesa de nuevo.
    await this.processed.record(event.id);
    return outcome;
  }

  private async paymentSucceeded(event: PaymentEvent): Promise<PaymentEventOutcome> {
    const order = await this.orders.findById(event.orderId);
    if (!order) return 'ignored';

    if (order.isPayable) {
      order.markPaid(this.clock());
      await this.orders.save(order); // bloqueo optimista: si choca, lanza y la pasarela reintenta
      return 'paid';
    }
    if (order.status === 'CANCELLED') {
      // Carrera rara: el cliente canceló (o la sesión expiró) justo mientras pagaba.
      // El dinero ya se cobró y el pedido no existe: lo devolvemos.
      await this.payments.refundCheckout(event.sessionId);
      return 'refunded';
    }
    return 'ignored'; // ya estaba pagado (o más adelante): nada que hacer
  }

  private async checkoutExpired(event: PaymentEvent): Promise<PaymentEventOutcome> {
    const order = await this.orders.findById(event.orderId);
    // Solo si sigue pendiente Y la sesión que expiró es la actual: si el cliente
    // abrió otra sesión después, la vieja puede expirar sin cancelar nada.
    if (!order?.isPayable || order.paymentSessionId !== event.sessionId) return 'ignored';

    order.cancel(this.clock());
    await this.orders.save(order);
    await this.stock.release(
      order.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    );
    return 'expired';
  }
}
