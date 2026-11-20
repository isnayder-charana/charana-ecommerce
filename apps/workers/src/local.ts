import { SNSClient } from '@aws-sdk/client-sns';
import { GetQueueUrlCommand, SQSClient } from '@aws-sdk/client-sqs';
import { DlqMonitor } from './alerts/dlq-monitor.js';
import { buildConsumers } from './consumers.js';
import { DynamoDbOrderEmailLog } from './shared/dynamodb-order-email-log.js';
import {
  createDynamoClient,
  DynamoDbProcessedEventStore,
} from './shared/dynamodb-processed-events.js';
import { loadEnv, requireInternalKey } from './shared/env.js';
import { HttpOrdersApi } from './shared/http-orders-api.js';
import { createEmailSender } from './shared/ses-email-sender.js';
import { consoleLogger } from './shared/logger.js';
import { SnsAlertPublisher } from './shared/sns-alert-publisher.js';
import { SqsPoller } from './shared/sqs-poller.js';
import { SqsQueueDepth } from './shared/sqs-queue-depth.js';

/**
 * Corredor LOCAL: en tu PC no hay Lambda, así que este proceso lee las colas
 * de LocalStack y llama a los mismos manejadores que usarán las Lambdas.
 */
const env = loadEnv(process.env);
if (!env.SQS_ENDPOINT) {
  // Sin endpoint leería las colas del AWS real. En AWS los workers son Lambdas, no este proceso.
  throw new Error('Falta SQS_ENDPOINT en apps/workers/.env (copia .env.example)');
}
const log = consoleLogger('workers');
const localstack = { accessKeyId: 'test', secretAccessKey: 'test' };
const sqs = new SQSClient({
  region: env.AWS_REGION,
  endpoint: env.SQS_ENDPOINT,
  credentials: localstack,
});
// En tu PC, SNS también es LocalStack: si falta SNS_ENDPOINT, se usa el mismo que SQS.
const sns = new SNSClient({
  region: env.AWS_REGION,
  endpoint: env.SNS_ENDPOINT ?? env.SQS_ENDPOINT,
  credentials: localstack,
});
const dynamo = createDynamoClient(env.AWS_REGION, env.DYNAMODB_ENDPOINT);
const processed = new DynamoDbProcessedEventStore(dynamo, env.DYNAMODB_TABLE);

const stop = new AbortController();
process.once('SIGINT', () => stop.abort());
process.once('SIGTERM', () => stop.abort());

const consumers = buildConsumers({
  processed,
  // En tu PC, SES también es LocalStack: si falta SES_ENDPOINT, se usa el mismo que SQS.
  emails: createEmailSender({ ...env, SES_ENDPOINT: env.SES_ENDPOINT ?? env.SQS_ENDPOINT }),
  emailHistory: new DynamoDbOrderEmailLog(dynamo, env.DYNAMODB_TABLE),
  storeUrl: env.STORE_URL,
  orders: new HttpOrdersApi(env.API_URL, requireInternalKey(env)),
});
// Paso 26: vigila las DLQ y avisa por SNS. En AWS lo hará una alarma de CloudWatch.
const dlqs = consumers.map(({ queueName }) => `${queueName}-dlq`);
const monitor = new DlqMonitor({
  depth: new SqsQueueDepth(sqs),
  alerts: new SnsAlertPublisher(sns, env.ALERTS_TOPIC),
  logger: consoleLogger('alertas'),
  queues: dlqs,
});
log.info(`alertas vigilando ${dlqs.join(', ')} cada ${env.DLQ_CHECK_SECONDS} s`);

await Promise.all([
  ...consumers.map(async ({ name, queueName, handler }) => {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    if (!QueueUrl) throw new Error(`No existe la cola ${queueName}: ¿corre LocalStack?`);
    log.info(`${name} escuchando ${queueName}`);
    await new SqsPoller(sqs, QueueUrl, handler, consoleLogger(name)).run(stop.signal);
  }),
  monitor.run(stop.signal, env.DLQ_CHECK_SECONDS * 1000),
]);
log.info('Workers detenidos');
sqs.destroy();
sns.destroy();
