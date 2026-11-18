import { randomUUID } from 'node:crypto';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  type DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { toOrderEvents } from '../../application/order-events.js';
import type { OrderRepository } from '../../application/order.repository.js';
import { toOutboxItem } from './dynamodb-outbox.repository.js';
import { ConcurrencyError } from '../../../../shared/domain/index.js';
import { Order, type OrderPrimitives } from '../../domain/index.js';

/**
 * Cómo se guarda un pedido en la tabla única:
 *
 *   PK = ORDER#<id>             SK = ORDER                       → findById (lectura directa)
 *   GSI1PK = CUSTOMER#<cliente> GSI1SK = ORDER#<fecha>#<id>      → findByCustomer (más nuevo primero)
 *
 * El pedido completo (líneas e historial incluidos) es UN item: el agregado
 * se lee y se escribe de una vez, igual que se modela en el dominio.
 *
 * Al guardar, los eventos del pedido van a la bandeja de salida (outbox) en la
 * MISMA transacción: o se guardan el pedido y sus eventos, o ninguno.
 */
type OrderItem = OrderPrimitives & {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  entity: 'Order';
};

const orderKey = (id: string) => ({ PK: `ORDER#${id}`, SK: 'ORDER' });

export class DynamoDbOrderRepository implements OrderRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async findById(id: string): Promise<Order | null> {
    const { Item } = await this.client.send(
      // ConsistentRead: queremos la última versión (importa para el bloqueo optimista).
      new GetCommand({ TableName: this.tableName, Key: orderKey(id), ConsistentRead: true }),
    );
    return Item ? toOrder(Item as OrderItem) : null;
  }

  async findByCustomer(customerId: string): Promise<Order[]> {
    const orders: Order[] = [];
    let startKey: Record<string, unknown> | undefined;
    // DynamoDB devuelve como máximo 1 MB por consulta: seguimos pidiendo
    // mientras haya LastEvaluatedKey (paginación).
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :prefix)',
          ExpressionAttributeValues: { ':pk': `CUSTOMER#${customerId}`, ':prefix': 'ORDER#' },
          ScanIndexForward: false, // orden descendente por fecha
          ExclusiveStartKey: startKey,
        }),
      );
      orders.push(...(page.Items ?? []).map((item) => toOrder(item as OrderItem)));
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return orders;
  }

  async save(order: Order): Promise<void> {
    const p = order.toPrimitives();
    const item: OrderItem = {
      ...orderKey(p.id),
      GSI1PK: `CUSTOMER#${p.customerId}`,
      GSI1SK: `ORDER#${p.createdAt}#${p.id}`,
      entity: 'Order',
      ...p,
      version: p.version + 1,
    };

    // Escritura condicional = bloqueo optimista en UNA sola operación atómica:
    // - pedido nuevo (versión 0): solo si el item aún no existe;
    // - pedido existente: solo si nadie lo cambió desde que lo leímos.
    const condition =
      p.version === 0
        ? { ConditionExpression: 'attribute_not_exists(PK)' }
        : {
            ConditionExpression: '#version = :expected',
            ExpressionAttributeNames: { '#version': 'version' },
            ExpressionAttributeValues: { ':expected': p.version },
          };

    const events = toOrderEvents(order, order.pullEvents(), randomUUID);

    try {
      // TransactWrite: hasta 100 escrituras que se aplican todas o ninguna (ACID).
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: this.tableName, Item: item, ...condition } },
            ...events.map((event) => ({
              Put: { TableName: this.tableName, Item: toOutboxItem(event) },
            })),
          ],
        }),
      );
    } catch (error) {
      // La transacción se cancela si falla la condición del pedido (bloqueo optimista)
      // o si otra transacción está escribiendo el mismo pedido en ese instante.
      const reason =
        error instanceof TransactionCanceledException
          ? error.CancellationReasons?.[0]?.Code
          : undefined;
      if (reason === 'ConditionalCheckFailed' || reason === 'TransactionConflict') {
        throw new ConcurrencyError('Order', p.id);
      }
      throw error;
    }
  }
}

function toOrder({ PK, SK, GSI1PK, GSI1SK, entity, ...primitives }: OrderItem): Order {
  return Order.fromPrimitives(primitives);
}
