import { fulfillOrder } from './fulfillment/fulfill-order.js';
import type { OrdersApi } from './fulfillment/orders-api.js';
import { notifyCustomer } from './notifications/notify-customer.js';
import type { EmailSender } from './shared/email.js';
import { consoleLogger, type Logger } from './shared/logger.js';
import type { ProcessedEventStore } from './shared/processed-events.js';
import { createSqsHandler, type OrderEventHandler, type SqsHandler } from './shared/sqs-handler.js';

export interface Consumer {
  name: string;
  /** La cola que lee (la crea infra/local/localstack/01-create-resources.sh). */
  queueName: string;
  handler: SqsHandler;
}

/** Lo que los workers necesitan del mundo exterior (adaptadores). */
export interface WorkerDeps {
  processed: ProcessedEventStore;
  emails: EmailSender;
  storeUrl: string;
  orders: OrdersApi;
}

const consumer = (
  name: string,
  processed: ProcessedEventStore,
  build: (logger: Logger) => OrderEventHandler,
): Consumer => {
  const logger = consoleLogger(name);
  return {
    name,
    queueName: `charanatech-${name}`,
    handler: createSqsHandler({ consumer: name, handle: build(logger), processed, logger }),
  };
};

/** Correos al cliente (pasos 24 y 32). */
export const notificationsConsumer = ({
  processed,
  emails,
  storeUrl,
}: Pick<WorkerDeps, 'processed' | 'emails' | 'storeUrl'>): Consumer =>
  consumer('notifications', processed, (logger) => notifyCustomer({ emails, logger, storeUrl }));

/** Envío simulado: pide a la API avanzar el pedido (paso 25). */
export const fulfillmentConsumer = ({
  processed,
  orders,
}: Pick<WorkerDeps, 'processed' | 'orders'>): Consumer =>
  consumer('fulfillment', processed, (logger) => fulfillOrder({ orders, logger }));

/** Los dos workers de la tienda, ya conectados (el corredor local los usa juntos). */
export function buildConsumers(deps: WorkerDeps): Consumer[] {
  return [notificationsConsumer(deps), fulfillmentConsumer(deps)];
}
