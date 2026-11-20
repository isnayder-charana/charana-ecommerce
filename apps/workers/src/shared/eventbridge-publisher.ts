import { type EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { EventPublisher } from './outbox-relay.js';
import type { OrderEvent } from './order-event.js';

/**
 * ADAPTADOR: publica un evento en EventBridge con el MISMO formato que la API
 * (apps/api, EventBridgePublisher): source = charanatech.orders y
 * detail-type = el tipo del evento. Las reglas del bus filtran por esos dos.
 */
export class EventBridgeOrderPublisher implements EventPublisher {
  constructor(
    private readonly client: Pick<EventBridgeClient, 'send'>,
    private readonly busName: string,
  ) {}

  async publish(event: OrderEvent): Promise<void> {
    const result = await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.busName,
            Source: 'charanatech.orders',
            DetailType: event.type,
            Time: new Date(event.occurredAt),
            Detail: JSON.stringify(event),
          },
        ],
      }),
    );
    // PutEvents puede rechazar un evento SIN lanzar error: hay que mirarlo.
    if (result.FailedEntryCount) {
      const reason = result.Entries?.[0]?.ErrorMessage ?? 'sin detalle';
      throw new Error(`EventBridge rechazó el evento ${event.id}: ${reason}`);
    }
  }
}
