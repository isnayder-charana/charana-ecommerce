import type { Logger } from '../shared/logger.js';
import type { OrderEventHandler } from '../shared/sqs-handler.js';
import type { OrdersApi } from './orders-api.js';

/** Qué paso del envío dispara cada evento. */
const NEXT_STEP = { OrderPaid: 'ship', OrderShipped: 'deliver' } as const;
const DONE = { ship: 'enviado', deliver: 'entregado' } as const;

/**
 * Worker `fulfillment`: el "almacén" simulado.
 *
 *   OrderPaid ──(espera en la cola)──► enviar   → la API publica OrderShipped
 *   OrderShipped ─(espera en la cola)─► entregar → la API publica OrderDelivered
 *
 * La espera no es un `setTimeout`: la cola charanatech-fulfillment tiene un
 * retraso (DelaySeconds), así el worker no se queda bloqueado esperando.
 * El cambio de estado lo hace la API (dueña de las reglas del pedido); el worker
 * solo se lo pide. Si la API falla, el error sube y SQS reintenta.
 */
export function fulfillOrder({
  orders,
  logger,
}: {
  orders: OrdersApi;
  logger: Logger;
}): OrderEventHandler {
  return async (event) => {
    const step = NEXT_STEP[event.type as keyof typeof NEXT_STEP];
    if (!step) return;

    const result = await orders.fulfill(event.orderId, step);
    logger.info(
      result.changed
        ? `Pedido ${event.orderId} ${DONE[step]}`
        : `Pedido ${event.orderId}: nada que hacer (ya está ${result.status})`,
    );
  };
}
