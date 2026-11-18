import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import type { Logger } from './logger.js';
import { InvalidMessageError, type OrderEvent, parseOrderEvent } from './order-event.js';
import type { ProcessedEventStore } from './processed-events.js';

/** Lo que hace un worker con UN evento. Si lanza error, el mensaje se reintenta. */
export type OrderEventHandler = (event: OrderEvent) => Promise<void>;

export type SqsHandler = (event: SQSEvent) => Promise<SQSBatchResponse>;

export interface SqsHandlerOptions {
  /** Nombre del worker: aparece en el log y en la clave de idempotencia. */
  consumer: string;
  handle: OrderEventHandler;
  processed: ProcessedEventStore;
  logger: Logger;
}

/**
 * Convierte un manejador de eventos en el manejador de Lambda para SQS.
 *
 * Lambda entrega los mensajes por LOTES (hasta 10). Si uno falla, no queremos
 * que se reintente el lote entero (y que los demás se procesen dos veces), así
 * que devolvemos solo los que fallaron en `batchItemFailures` ("partial batch
 * response"). SQS borra los que salieron bien y reintenta los otros; después
 * de 3 intentos, un mensaje pasa a la DLQ.
 */
export function createSqsHandler({
  consumer,
  handle,
  processed,
  logger,
}: SqsHandlerOptions): SqsHandler {
  return async ({ Records }) => {
    const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

    for (const record of Records) {
      const attempt = record.attributes.ApproximateReceiveCount;
      try {
        const event = parseOrderEvent(record.body);
        const label = `${event.type} del pedido ${event.orderId} (evento ${event.id})`;

        if (await processed.has(consumer, event.id)) {
          logger.info(`${label}: ya procesado, se ignora`);
          continue;
        }
        await handle(event);
        // Se anota DESPUÉS de procesar: si falla a mitad, el reintento lo vuelve a hacer.
        await processed.record(consumer, event.id);
        logger.info(`${label}: procesado`);
      } catch (error) {
        const kind = error instanceof InvalidMessageError ? 'mensaje inválido' : 'falló';
        logger.error(
          `Mensaje ${record.messageId} ${kind} (intento ${attempt}): ${(error as Error).message}`,
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };
}
