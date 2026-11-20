import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { memoryLogger, orderEvent } from '../../test/support/fixtures.js';
import type { OrderEvent } from './order-event.js';
import { createOutboxRelay, type OutboxKey, type Unmarshall } from './outbox-relay.js';

/** Un registro de DynamoDB Streams como el que entrega Lambda (formato DynamoDB JSON). */
function streamRecord(
  sequence: string,
  item: { PK: string; SK: string; event?: unknown },
  eventName: DynamoDBRecord['eventName'] = 'INSERT',
): DynamoDBRecord {
  const toAttr = (value: unknown): object =>
    typeof value === 'string'
      ? { S: value }
      : typeof value === 'number'
        ? { N: String(value) }
        : {
            M: Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, toAttr(v)])),
          };
  return {
    eventName,
    dynamodb: {
      SequenceNumber: sequence,
      NewImage: Object.fromEntries(
        Object.entries(item).map(([k, v]) => [k, toAttr(v)]),
      ) as NonNullable<DynamoDBRecord['dynamodb']>['NewImage'],
    },
  };
}

const outboxItem = (event: OrderEvent) => ({
  PK: 'OUTBOX',
  SK: `${event.occurredAt}#${event.id}`,
  event,
});

function relayWith({ failOn }: { failOn?: string } = {}) {
  const published: string[] = [];
  const removed: OutboxKey[] = [];
  const logger = memoryLogger();
  const relay = createOutboxRelay({
    publisher: {
      publish: async (event) => {
        if (event.id === failOn) throw new Error('EventBridge no responde');
        published.push(`${event.type}:${event.id}`);
      },
    },
    outbox: { remove: async (key) => void removed.push(key) },
    unmarshall: unmarshall as unknown as Unmarshall,
    logger,
  });
  return { relay, published, removed, logger };
}

const paid = { ...orderEvent, id: 'e-1' } as OrderEvent;
const shipped = { ...orderEvent, id: 'e-2', type: 'OrderShipped', status: 'SHIPPED' } as OrderEvent;

describe('Relé del outbox (DynamoDB Streams → EventBridge)', () => {
  it('publica cada evento nuevo de la bandeja, en orden, y lo borra después', async () => {
    const { relay, published, removed, logger } = relayWith();

    const result = await relay({
      Records: [streamRecord('1', outboxItem(paid)), streamRecord('2', outboxItem(shipped))],
    });

    expect(result).toEqual({ batchItemFailures: [] });
    expect(published).toEqual(['OrderPaid:e-1', 'OrderShipped:e-2']);
    expect(removed).toEqual([
      { PK: 'OUTBOX', SK: `${paid.occurredAt}#e-1` },
      { PK: 'OUTBOX', SK: `${shipped.occurredAt}#e-2` },
    ]);
    expect(logger.lines).toEqual([
      'OrderPaid del pedido o-1 publicado (evento e-1)',
      'OrderShipped del pedido o-1 publicado (evento e-2)',
    ]);
  });

  it('ignora lo que no es un item nuevo de la bandeja (pedidos, carritos, borrados)', async () => {
    const { relay, published } = relayWith();
    const event: DynamoDBStreamEvent = {
      Records: [
        streamRecord('1', { PK: 'ORDER#o-1', SK: 'ORDER' }),
        streamRecord('2', outboxItem(paid), 'REMOVE'),
        { eventName: 'INSERT', dynamodb: { SequenceNumber: '3' } },
      ],
    };

    expect(await relay(event)).toEqual({ batchItemFailures: [] });
    expect(published).toEqual([]);
  });

  it('si uno falla, devuelve ese para reintentar desde él y no toca los siguientes', async () => {
    const { relay, published, removed, logger } = relayWith({ failOn: 'e-1' });

    const result = await relay({
      Records: [streamRecord('7', outboxItem(paid)), streamRecord('8', outboxItem(shipped))],
    });

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: '7' }] });
    expect(published).toEqual([]);
    expect(removed).toEqual([]);
    expect(logger.lines).toEqual([
      `ERROR No se pudo publicar ${paid.occurredAt}#e-1: EventBridge no responde`,
    ]);
  });

  it('un evento que no cumple el contrato no se publica', async () => {
    const { relay, published } = relayWith();

    const result = await relay({
      Records: [streamRecord('9', { PK: 'OUTBOX', SK: 'x#e-9', event: { id: 'e-9' } })],
    });

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: '9' }] });
    expect(published).toEqual([]);
  });

  it('sin número de secuencia no puede marcar el fallo: lanza para reintentar el lote', async () => {
    const { relay } = relayWith({ failOn: 'e-1' });
    const record = streamRecord('1', outboxItem(paid));
    delete record.dynamodb?.SequenceNumber;

    await expect(relay({ Records: [record] })).rejects.toThrow('EventBridge no responde');
  });
});
