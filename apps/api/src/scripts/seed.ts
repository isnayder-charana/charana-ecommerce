import { PRODUCT_SEED } from '../modules/catalog/infrastructure/persistence/product.seed.js';
import { createPrismaClient } from '../shared/infrastructure/database/prisma.js';

/**
 * Carga los productos de ejemplo en MySQL. Es idempotente: si el producto ya
 * existe (mismo id), lo deja como está. Se ejecuta con `pnpm db:seed`.
 */
const url =
  process.env.DATABASE_URL ?? 'mysql://charanatech:charanatech@localhost:3306/charanatech';
const prisma = createPrismaClient(url);

try {
  for (const { version: _version, ...product } of PRODUCT_SEED) {
    await prisma.product.upsert({ where: { id: product.id }, create: product, update: {} });
  }
  console.log(`Seed: ${PRODUCT_SEED.length} productos listos en ${new URL(url).pathname.slice(1)}`);
} finally {
  await prisma.$disconnect();
}
