import type { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { orderEvent } from '../../test/support/fixtures.js';
import { EventBridgeOrderPublisher } from './eventbridge-publisher.js';
import type { OrderEvent } from './order-event.js';

function fakeClient(response: object) {
  const commands: PutEventsCommand[] = [];
  const client = {
    send: async (command: PutEventsCommand) => {
      commands.push(command);
      return response;
    },
  } as unknown as Pick<EventBridgeClient, 'send'>;
  return { client, commands };
}

describe('EventBridgeOrderPublisher', () => {
  it('publica con el mismo sobre que la API: source charanatech.orders y detail-type = tipo', async () => {
    const { client, commands } = fakeClient({ FailedEntryCount: 0 });

    await new EventBridgeOrderPublisher(client, 'charanatech').publish(orderEvent as OrderEvent);

    expect(commands[0]?.input.Entries).toEqual([
      {
        EventBusName: 'charanatech',
        Source: 'charanatech.orders',
        DetailType: 'OrderPaid',
        Time: new Date(orderEvent.occurredAt),
        Detail: JSON.stringify(orderEvent),
      },
    ]);
  });

  it('si EventBridge rechaza el evento (sin lanzar), lanza para que se reintente', async () => {
    const { client } = fakeClient({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'X', ErrorMessage: 'bus inexistente' }],
    });

    await expect(
      new EventBridgeOrderPublisher(client, 'otro').publish(orderEvent as OrderEvent),
    ).rejects.toThrow('EventBridge rechazó el evento e-1: bus inexistente');
  });
});
