import { type EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { EventPublisher, OrderEvent } from '../../application/order-events.js';

/** Quién publica: el módulo Orders. Las reglas de EventBridge filtran por este valor. */
export const ORDER_EVENTS_SOURCE = 'charanatech.orders';

/**
 * ADAPTADOR: publica en un bus de EventBridge (en AWS o en LocalStack).
 * Cada evento sale con source = charanatech.orders y detail-type = su tipo
 * (OrderPaid…), que es justo lo que miran las reglas del bus.
 */
export class EventBridgePublisher implements EventPublisher {
  constructor(
    private readonly client: Pick<EventBridgeClient, 'send'>,
    private readonly busName: string,
  ) {}

  async publish(events: OrderEvent[]): Promise<void> {
    // PutEvents acepta hasta 10 eventos por llamada.
    for (let i = 0; i < events.length; i += 10) {
      const batch = events.slice(i, i + 10);
      const result = await this.client.send(
        new PutEventsCommand({
          Entries: batch.map((event) => ({
            EventBusName: this.busName,
            Source: ORDER_EVENTS_SOURCE,
            DetailType: event.type,
            Time: new Date(event.occurredAt),
            Detail: JSON.stringify(event),
          })),
        }),
      );
      // PutEvents puede aceptar unos y rechazar otros SIN lanzar error: hay que mirarlo.
      if (result.FailedEntryCount) {
        const reason = result.Entries?.find((e) => e.ErrorCode)?.ErrorMessage ?? 'sin detalle';
        throw new Error(`EventBridge rechazó ${result.FailedEntryCount} evento(s): ${reason}`);
      }
    }
  }
}
