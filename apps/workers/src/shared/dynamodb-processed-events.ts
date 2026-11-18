import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { ProcessedEventStore } from './processed-events.js';

/** SQS guarda un mensaje como máximo 14 días: recordarlo ese tiempo basta. */
const RETENTION_DAYS = 14;

/**
 * ADAPTADOR: eventos procesados en la misma tabla única que usa la API.
 *
 *   PK = WORKER_EVENT#<worker>#<id del evento>   SK = WORKER_EVENT   expiresAt = TTL
 */
export class DynamoDbProcessedEventStore implements ProcessedEventStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async has(consumer: string, eventId: string): Promise<boolean> {
    const { Item } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key(consumer, eventId),
        ConsistentRead: true,
      }),
    );
    return Item !== undefined;
  }

  async record(consumer: string, eventId: string): Promise<void> {
    const expiresAt = Math.floor(this.clock().getTime() / 1000) + RETENTION_DAYS * 24 * 3600;
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { ...key(consumer, eventId), entity: 'WorkerEvent', expiresAt },
      }),
    );
  }
}

const key = (consumer: string, eventId: string) => ({
  PK: `WORKER_EVENT#${consumer}#${eventId}`,
  SK: 'WORKER_EVENT',
});

export function createDynamoClient(region: string, endpoint?: string): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region,
    endpoint,
    // DynamoDB Local acepta cualquier credencial; en AWS se usan las del rol de la Lambda.
    ...(endpoint && { credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }),
  });
  return DynamoDBDocumentClient.from(client);
}
