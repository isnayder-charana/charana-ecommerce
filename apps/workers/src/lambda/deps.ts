import { buildConsumers, type Consumer } from '../consumers.js';
import {
  createDynamoClient,
  DynamoDbProcessedEventStore,
} from '../shared/dynamodb-processed-events.js';
import { loadEnv, requireInternalKey } from '../shared/env.js';
import { HttpOrdersApi } from '../shared/http-orders-api.js';
import { createEmailSender } from '../shared/ses-email-sender.js';

/**
 * Se ejecuta una sola vez por contenedor de Lambda (fuera del handler), así
 * los clientes de AWS se reutilizan entre invocaciones.
 */
const env = loadEnv(process.env);
const processed = new DynamoDbProcessedEventStore(
  createDynamoClient(env.AWS_REGION, env.DYNAMODB_ENDPOINT),
  env.DYNAMODB_TABLE,
);
const consumers = buildConsumers({
  processed,
  emails: createEmailSender(env),
  storeUrl: env.STORE_URL,
  orders: new HttpOrdersApi(env.API_URL, requireInternalKey(env)),
});

export const consumerNamed = (name: string): Consumer => {
  const consumer = consumers.find((c) => c.name === name);
  if (!consumer) throw new Error(`No existe el worker ${name}`);
  return consumer;
};
