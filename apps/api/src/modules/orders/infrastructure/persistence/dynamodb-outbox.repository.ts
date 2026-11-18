import {
  BatchWriteCommand,
  type DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { OrderEvent, OutboxStore } from '../../application/order-events.js';

/**
 * La bandeja de salida (outbox) en la tabla única:
 *
 *   PK = OUTBOX   SK = <fecha ISO>#<id del evento>   event = { …el OrderEvent… }
 *
 * Todos los pendientes comparten la misma PK y la SK empieza por la fecha, así que
 * una Query devuelve los más antiguos primero. Una sola partición aguanta de sobra
 * el tráfico de esta tienda; con mucho volumen se repartiría en varias.
 */
const OUTBOX_PK = 'OUTBOX';
const outboxSk = (event: Pick<OrderEvent, 'occurredAt' | 'id'>) =>
  `${event.occurredAt}#${event.id}`;

/** El item que el repositorio de pedidos agrega a su transacción. */
export function toOutboxItem(event: OrderEvent) {
  return { PK: OUTBOX_PK, SK: outboxSk(event), entity: 'OutboxEvent', event };
}

export class DynamoDbOutboxStore implements OutboxStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async pending(limit: number): Promise<OrderEvent[]> {
    const { Items = [] } = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': OUTBOX_PK },
        Limit: limit,
        ConsistentRead: true,
      }),
    );
    return Items.map((item) => item.event as OrderEvent);
  }

  async remove(events: OrderEvent[]): Promise<void> {
    // BatchWrite acepta hasta 25 operaciones por llamada. Si alguna quedara sin
    // procesar, ese evento se publicaría otra vez: los consumidores lo toleran.
    for (let i = 0; i < events.length; i += 25) {
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: events.slice(i, i + 25).map((event) => ({
              DeleteRequest: { Key: { PK: OUTBOX_PK, SK: outboxSk(event) } },
            })),
          },
        }),
      );
    }
  }
}
