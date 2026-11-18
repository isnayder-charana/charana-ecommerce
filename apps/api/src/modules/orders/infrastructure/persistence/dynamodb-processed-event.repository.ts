import { type DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { ProcessedEventStore } from '../../application/payment-event.js';

/** Stripe reintenta un aviso durante 3 días: guardarlo 30 es más que suficiente. */
const RETENTION_DAYS = 30;

/**
 * Avisos ya procesados, en la misma tabla única:
 *
 *   PK = PAYMENT_EVENT#<id>   SK = PAYMENT_EVENT   expiresAt = <epoch en segundos>
 *
 * `expiresAt` es el atributo TTL: DynamoDB borra el item solo cuando pasa esa
 * fecha (en AWS; DynamoDB Local lo ignora). Así la tabla no crece para siempre.
 */
export class DynamoDbProcessedEventStore implements ProcessedEventStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async has(eventId: string): Promise<boolean> {
    const { Item } = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: key(eventId), ConsistentRead: true }),
    );
    return Item !== undefined;
  }

  async record(eventId: string): Promise<void> {
    const expiresAt = Math.floor(this.clock().getTime() / 1000) + RETENTION_DAYS * 24 * 3600;
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { ...key(eventId), entity: 'PaymentEvent', expiresAt },
      }),
    );
  }
}

const key = (eventId: string) => ({ PK: `PAYMENT_EVENT#${eventId}`, SK: 'PAYMENT_EVENT' });
