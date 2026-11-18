import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.js';
import { createDynamoClient, DYNAMODB_CLIENT, type DynamoDBDocumentClient } from './dynamodb.js';
import { createPrismaClient, PRISMA_CLIENT, type PrismaClient } from './prisma.js';

const usesDatabase = (config: ConfigService<Env, true>) =>
  config.get('PERSISTENCE', { infer: true }) === 'database';

/**
 * Entrega a toda la app un único cliente de cada base de datos:
 * PrismaClient (MySQL, catálogo) y DynamoDB (pedidos). Con PERSISTENCE=memory
 * ambos son null. Al apagar el servidor cierra las conexiones.
 */
@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PrismaClient | null => {
        const url = config.get('DATABASE_URL', { infer: true });
        return usesDatabase(config) && url ? createPrismaClient(url) : null;
      },
    },
    {
      provide: DYNAMODB_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): DynamoDBDocumentClient | null =>
        usesDatabase(config)
          ? createDynamoClient({
              region: config.get('AWS_REGION', { infer: true }),
              endpoint: config.get('DYNAMODB_ENDPOINT', { infer: true }),
            })
          : null,
    },
  ],
  exports: [PRISMA_CLIENT, DYNAMODB_CLIENT],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient | null,
    @Inject(DYNAMODB_CLIENT) private readonly dynamo: DynamoDBDocumentClient | null,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma?.$disconnect();
    this.dynamo?.destroy();
  }
}
