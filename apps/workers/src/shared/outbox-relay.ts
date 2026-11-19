import type { DynamoDBBatchResponse, DynamoDBStreamEvent } from 'aws-lambda';
import type { Logger } from './logger.js';
import { type OrderEvent, orderEventSchema } from './order-event.js';

/**
 * Relé del outbox en AWS (paso 31).
 *
 * En tu PC, la API revisa la bandeja de salida cada segundo (setInterval). En
 * Lambda eso no sirve: la función se congela entre peticiones. En su lugar,
 * DynamoDB Streams avisa de cada item nuevo de la tabla y esta Lambda:
 *
 *   1. toma solo los items OUTBOX recién creados,
 *   2. publica el evento en EventBridge,
 *   3. borra el item de la bandeja.
 *
 * Si falla entre 2 y 3, el evento se publica dos veces: los workers ya lo
 * toleran (idempotencia, paso 23). Es la garantía "al menos una vez".
 */

/** La clave del item de la bandeja de salida en la tabla única. */
export interface OutboxKey {
  PK: string;
  SK: string;
}

/** PUERTO: publicar un evento en el bus. */
export interface EventPublisher {
  publish(event: OrderEvent): Promise<void>;
}

/** PUERTO: sacar un item de la bandeja de salida ya publicado. */
export interface OutboxCleaner {
  remove(key: OutboxKey): Promise<void>;
}

/** Convierte una imagen de DynamoDB Streams ({ PK: { S: "…" } }) en un objeto normal. */
export type Unmarshall = (image: NonNullable<StreamImage>) => Record<string, unknown>;
type StreamImage = NonNullable<DynamoDBStreamEvent['Records'][number]['dynamodb']>['NewImage'];

export interface OutboxRelayOptions {
  publisher: EventPublisher;
  outbox: OutboxCleaner;
  unmarshall: Unmarshall;
  logger: Logger;
}

export type StreamHandler = (event: DynamoDBStreamEvent) => Promise<DynamoDBBatchResponse>;

export function createOutboxRelay({
  publisher,
  outbox,
  unmarshall,
  logger,
}: OutboxRelayOptions): StreamHandler {
  return async ({ Records }) => {
    for (const record of Records) {
      const image = record.dynamodb?.NewImage;
      // El filtro de la Lambda ya deja pasar solo INSERT de OUTBOX; esto es por si acaso.
      if (record.eventName !== 'INSERT' || !image) continue;
      const item = unmarshall(image);
      if (item.PK !== 'OUTBOX') continue;

      try {
        const result = orderEventSchema.safeParse(item.event);
        if (!result.success) {
          throw new Error(`el item ${String(item.SK)} no trae un evento válido`);
        }
        const event = result.data;
        await publisher.publish(event);
        await outbox.remove({ PK: 'OUTBOX', SK: String(item.SK) });
        logger.info(`${event.type} del pedido ${event.orderId} publicado (evento ${event.id})`);
      } catch (error) {
        logger.error(`No se pudo publicar ${String(item.SK)}: ${(error as Error).message}`);
        const sequence = record.dynamodb?.SequenceNumber;
        if (!sequence) throw error;
        // El stream es ORDENADO: devolvemos el primero que falló y Lambda
        // reintenta desde ahí (ese y los siguientes), sin repetir los anteriores.
        return { batchItemFailures: [{ itemIdentifier: sequence }] };
      }
    }
    return { batchItemFailures: [] };
  };
}
