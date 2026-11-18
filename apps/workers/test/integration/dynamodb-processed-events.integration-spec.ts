import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  createDynamoClient,
  DynamoDbProcessedEventStore,
} from '../../src/shared/dynamodb-processed-events.js';

const ENDPOINT = process.env.TEST_DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const TABLE = 'charanatech-workers-test';

describe('DynamoDbProcessedEventStore (DynamoDB Local)', () => {
  const raw = new DynamoDBClient({
    region: 'us-east-2',
    endpoint: ENDPOINT,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
  const client = createDynamoClient('us-east-2', ENDPOINT);

  beforeAll(async () => {
    try {
      await raw.send(new DeleteTableCommand({ TableName: TABLE }));
    } catch (error) {
      if (!(error instanceof ResourceNotFoundException)) throw error;
    }
    await raw.send(
      new CreateTableCommand({
        TableName: TABLE,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
      }),
    );
  });

  afterAll(() => {
    client.destroy();
    raw.destroy();
  });

  it('recuerda cada evento por worker, con fecha de expiración (TTL)', async () => {
    const store = new DynamoDbProcessedEventStore(
      client,
      TABLE,
      () => new Date('2026-11-17T00:00:00Z'),
    );

    expect(await store.has('notifications', 'e-1')).toBe(false);
    await store.record('notifications', 'e-1');
    await store.record('notifications', 'e-1'); // anotarlo dos veces no falla

    expect(await store.has('notifications', 'e-1')).toBe(true);
    expect(await store.has('fulfillment', 'e-1')).toBe(false);

    const { Item } = await client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: 'WORKER_EVENT#notifications#e-1', SK: 'WORKER_EVENT' },
      }),
    );
    expect(Item!.expiresAt).toBe(Date.parse('2026-12-01T00:00:00Z') / 1000);
  });
});
