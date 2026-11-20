import { type DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { OrderEmailLog, OrderEmailRecord } from './order-email-log.js';

/** Los correos se muestran en la página del pedido durante 90 días; luego DynamoDB los borra. */
const RETENTION_DAYS = 90;

/**
 * ADAPTADOR: los correos de cada pedido, en la tabla única.
 *
 *   PK = ORDER_EMAIL#<pedido>   SK = <fecha del evento>#<id del evento>   expiresAt = TTL
 *
 * La API los lee con una sola consulta por PK, ya ordenados por fecha.
 * El rol de `notifications` solo puede escribir claves que empiezan con ORDER_EMAIL#.
 */
export class DynamoDbOrderEmailLog implements OrderEmailLog {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async record(email: OrderEmailRecord): Promise<void> {
    const expiresAt = Math.floor(this.clock().getTime() / 1000) + RETENTION_DAYS * 24 * 3600;
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `ORDER_EMAIL#${email.orderId}`,
          SK: `${email.occurredAt}#${email.eventId}`,
          entity: 'OrderEmail',
          ...email,
          expiresAt,
        },
      }),
    );
  }
}
