import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface DynamoConfig {
  region: string;
  /** Solo en local (DynamoDB Local de compose.yaml). En AWS se omite. */
  endpoint?: string;
}

/**
 * Crea el "Document Client": convierte objetos JS normales al formato de
 * DynamoDB ({ S: 'texto' }, { N: '12' }...) y de vuelta, para no escribirlo a mano.
 */
export function createDynamoClient({ region, endpoint }: DynamoConfig): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region,
    endpoint,
    // DynamoDB Local acepta cualquier credencial; en AWS se usan las del rol (Lambda).
    ...(endpoint && { credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }),
  });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export type { DynamoDBDocumentClient };
export const DYNAMODB_CLIENT = Symbol('DynamoDBClient');

/**
 * Diseño de UNA sola tabla (single-table design) para todo lo que vive en
 * DynamoDB (pedidos hoy; carrito en la fase 2). Las claves son genéricas
 * (PK, SK, GSI1PK, GSI1SK) y cada entidad decide qué guarda en ellas.
 * En AWS esta misma definición la crea Terraform (fase 4).
 */
export function tableDefinition(tableName: string) {
  return new CreateTableCommand({
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST', // se paga por petición: ~0 USD con poco tráfico
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  });
}

/** Crea la tabla si no existe (idempotente). Devuelve true si la creó. */
export async function ensureTable(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return false;
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
  }
  await client.send(tableDefinition(tableName));
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: tableName });
  return true;
}
