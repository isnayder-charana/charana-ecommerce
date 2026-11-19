import { DeleteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { OutboxCleaner, OutboxKey } from './outbox-relay.js';

/** ADAPTADOR: borra de la tabla única un item de la bandeja ya publicado. */
export class DynamoDbOutboxCleaner implements OutboxCleaner {
  constructor(
    private readonly client: Pick<DynamoDBDocumentClient, 'send'>,
    private readonly tableName: string,
  ) {}

  async remove(key: OutboxKey): Promise<void> {
    await this.client.send(new DeleteCommand({ TableName: this.tableName, Key: key }));
  }
}
