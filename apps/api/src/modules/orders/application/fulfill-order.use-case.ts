import type { UseCase } from '../../../shared/application/use-case.js';
import { OrderNotFoundError, type OrderStatus } from '../domain/index.js';
import type { OrderRepository } from './order.repository.js';

export const FULFILLMENT_STEPS = ['ship', 'deliver'] as const;
export type FulfillmentStep = (typeof FULFILLMENT_STEPS)[number];

export interface FulfillmentResult {
  status: OrderStatus;
  /** false si no había nada que hacer (paso ya hecho o pedido cancelado). */
  changed: boolean;
}

/** Hasta dónde lleva cada paso al pedido. */
const TARGET: Record<FulfillmentStep, OrderStatus> = { ship: 'SHIPPED', deliver: 'DELIVERED' };

/**
 * El "almacén" (worker fulfillment) avanza el pedido: lo envía y luego lo entrega.
 *
 * Es IDEMPOTENTE a propósito: los eventos llegan "al menos una vez", así que pedir
 * enviar un pedido que ya está enviado (o entregado) no es un error, simplemente
 * no cambia nada. Tampoco se envía un pedido cancelado mientras tanto. Cualquier
 * otro salto raro lo sigue rechazando la máquina de estados del dominio.
 */
export class FulfillOrderUseCase implements UseCase<
  { id: string; step: FulfillmentStep },
  FulfillmentResult
> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly clock: () => Date,
  ) {}

  async execute({ id, step }: { id: string; step: FulfillmentStep }): Promise<FulfillmentResult> {
    const order = await this.orders.findById(id);
    if (!order) throw new OrderNotFoundError(id);

    const alreadyDone =
      order.status === TARGET[step] || (step === 'ship' && order.status === 'DELIVERED');
    if (alreadyDone || order.status === 'CANCELLED') {
      return { status: order.status, changed: false };
    }

    const now = this.clock();
    if (step === 'ship') order.ship(now);
    else order.deliver(now);

    // Si justo el cliente cancela, el bloqueo optimista lanza ConcurrencyError (409)
    // y el worker reintenta: la segunda vez verá CANCELLED y no hará nada.
    await this.orders.save(order);
    return { status: order.status, changed: true };
  }
}
