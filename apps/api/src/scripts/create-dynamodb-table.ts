import { createDynamoClient, ensureTable } from '../shared/infrastructure/database/dynamodb.js';

/**
 * Crea la tabla de DynamoDB en DynamoDB Local (compose.yaml). Es idempotente.
 * Se ejecuta con `pnpm db:tables`. En AWS la tabla la crea Terraform (fase 4).
 */
const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const tableName = process.env.DYNAMODB_TABLE ?? 'charanatech';
const client = createDynamoClient({ region: process.env.AWS_REGION ?? 'us-east-1', endpoint });

try {
  const created = await ensureTable(client, tableName);
  console.log(`DynamoDB: tabla "${tableName}" ${created ? 'creada' : 'ya existía'} en ${endpoint}`);
} finally {
  client.destroy();
}
