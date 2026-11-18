import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { PRISMA_CLIENT, type PrismaClient } from '../../shared/infrastructure/database/prisma.js';
import { CreateProductUseCase } from './application/create-product.use-case.js';
import { GetProductUseCase } from './application/get-product.use-case.js';
import { ListProductsUseCase } from './application/list-products.use-case.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './application/product.repository.js';
import { ProductsController } from './infrastructure/http/products.controller.js';
import { InMemoryProductRepository } from './infrastructure/persistence/in-memory-product.repository.js';
import { PrismaProductRepository } from './infrastructure/persistence/prisma-product.repository.js';
import { PRODUCT_SEED } from './infrastructure/persistence/product.seed.js';

/**
 * Aquí se "enchufan" los adaptadores a los puertos. Los casos de uso no
 * conocen Nest: los construimos con useFactory y les pasamos el repositorio.
 * PERSISTENCE decide qué adaptador recibe el puerto PRODUCT_REPOSITORY:
 * MySQL (Prisma) o memoria. Los casos de uso no se enteran del cambio.
 */
@Module({
  controllers: [ProductsController],
  providers: [
    {
      provide: PRODUCT_REPOSITORY,
      inject: [ConfigService, PRISMA_CLIENT],
      useFactory: (config: ConfigService<Env, true>, prisma: PrismaClient | null) =>
        config.get('PERSISTENCE', { infer: true }) === 'database' && prisma
          ? new PrismaProductRepository(prisma)
          : new InMemoryProductRepository(PRODUCT_SEED),
    },
    {
      provide: ListProductsUseCase,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (repo: ProductRepository) => new ListProductsUseCase(repo),
    },
    {
      provide: GetProductUseCase,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (repo: ProductRepository) => new GetProductUseCase(repo),
    },
    {
      provide: CreateProductUseCase,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (repo: ProductRepository) => new CreateProductUseCase(repo, randomUUID),
    },
  ],
  exports: [PRODUCT_REPOSITORY],
})
export class CatalogModule {}
