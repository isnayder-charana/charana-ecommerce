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

/** Los workers de la tienda, ya conectados. Los usan las Lambdas y el corredor local. */
export function buildConsumers({ processed, emails, storeUrl, orders }: WorkerDeps): Consumer[] {
  const consumer = (name: string, build: (logger: Logger) => OrderEventHandler): Consumer => {
    const logger = consoleLogger(name);
    return {
      name,
      queueName: `charanatech-${name}`,
      handler: createSqsHandler({ consumer: name, handle: build(logger), processed, logger }),
    };
  };
  return [
    consumer('notifications', (logger) => notifyCustomer({ emails, logger, storeUrl })),
    consumer('fulfillment', (logger) => fulfillOrder({ orders, logger })),
  ];
}
