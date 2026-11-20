import { type DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { OrderEmailView, OrderEmailsReader } from '../../application/order-emails.js';

/**
 * ADAPTADOR: lee los correos que guarda el worker `notifications`.
 *
 *   PK = ORDER_EMAIL#<pedido>   SK = <fecha del evento>#<id del evento>
 *
 * Una sola consulta por PK: DynamoDB los devuelve ordenados por SK (por fecha).
 */
export class DynamoDbOrderEmailsReader implements OrderEmailsReader {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async findByOrder(orderId: string): Promise<OrderEmailView[]> {
    // Un pedido tiene como mucho 4 correos (pagado, enviado, entregado o cancelado):
    // cabe de sobra en una página de 1 MB, no hace falta paginar.
    const { Items = [] } = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `ORDER_EMAIL#${orderId}` },
      }),
    );
    return Items.map((item) => ({
      subject: String(item.subject),
      text: String(item.text),
      occurredAt: String(item.occurredAt),
      delivered: item.delivered === true,
    }));
  }
}
