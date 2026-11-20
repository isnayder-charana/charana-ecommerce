import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamEvent, SQSEvent } from 'aws-lambda';
import { fulfillmentConsumer, notificationsConsumer } from '../consumers.js';
import { createOutboxRelay, type Unmarshall } from '../shared/outbox-relay.js';
import { DynamoDbOutboxCleaner } from '../shared/dynamodb-outbox.js';
import {
  createDynamoClient,
  DynamoDbProcessedEventStore,
} from '../shared/dynamodb-processed-events.js';
import { loadEnv, requireInternalKey } from '../shared/env.js';
import type { EventHandler } from '../shared/event-server.js';
import { EventBridgeOrderPublisher } from '../shared/eventbridge-publisher.js';
import { HttpOrdersApi } from '../shared/http-orders-api.js';
import { consoleLogger } from '../shared/logger.js';
import { createEmailSender } from '../shared/ses-email-sender.js';

/** Las tres Lambdas comparten imagen; la variable WORKER elige cuál es esta. */
export const WORKERS = ['notifications', 'fulfillment', 'outbox-relay'] as const;

/**
 * Arma SOLO el worker pedido, con sus adaptadores de AWS. Se ejecuta una vez
 * por contenedor de Lambda: los clientes se reutilizan entre invocaciones.
 */
export function buildHandler(
  name: string | undefined,
  source: Record<string, string | undefined>,
): EventHandler {
  const env = loadEnv(source);
  const dynamo = createDynamoClient(env.AWS_REGION, env.DYNAMODB_ENDPOINT);
  const processed = new DynamoDbProcessedEventStore(dynamo, env.DYNAMODB_TABLE);

  switch (name) {
    case 'notifications': {
      const { handler } = notificationsConsumer({
        processed,
        emails: createEmailSender(env),
        storeUrl: env.STORE_URL,
      });
      return (event) => handler(event as SQSEvent);
    }
    case 'fulfillment': {
      const { handler } = fulfillmentConsumer({
        processed,
        orders: new HttpOrdersApi(env.API_URL, requireInternalKey(env)),
      });
      return (event) => handler(event as SQSEvent);
    }
    case 'outbox-relay': {
      const relay = createOutboxRelay({
        publisher: new EventBridgeOrderPublisher(
          new EventBridgeClient({ region: env.AWS_REGION }),
          env.EVENT_BUS_NAME,
        ),
        outbox: new DynamoDbOutboxCleaner(dynamo, env.DYNAMODB_TABLE),
        // Los tipos de aws-lambda y los del SDK describen lo mismo con nombres distintos.
        unmarshall: unmarshall as unknown as Unmarshall,
        logger: consoleLogger('outbox-relay'),
      });
      return (event) => relay(event as DynamoDBStreamEvent);
    }
    default:
      throw new Error(`WORKER debe ser uno de: ${WORKERS.join(', ')} (llegó "${name ?? ''}")`);
  }
}
