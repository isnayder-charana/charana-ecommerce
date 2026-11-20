import {
  PRODUCT_SEED,
  productImageUrl,
} from '../modules/catalog/infrastructure/persistence/product.seed.js';
import { createPrismaClient } from '../shared/infrastructure/database/prisma.js';

/**
 * Carga los productos de ejemplo en MySQL. Es idempotente: si el producto ya
 * existe (mismo id), lo deja como está, salvo la foto: con PRODUCT_IMAGES_URL
 * (paso 33) actualiza `imageUrl`. Se ejecuta con `pnpm db:seed`.
 */
const url =
  process.env.DATABASE_URL ?? 'mysql://charanatech:charanatech@localhost:3306/charanatech';
const prisma = createPrismaClient(url);
const imagesUrl = process.env.PRODUCT_IMAGES_URL;

try {
  for (const { version: _version, ...product } of PRODUCT_SEED) {
    const imageUrl = productImageUrl(product.sku, imagesUrl);
    await prisma.product.upsert({
      where: { id: product.id },
      create: { ...product, imageUrl },
      update: imageUrl ? { imageUrl } : {},
    });
  }
  console.log(`Seed: ${PRODUCT_SEED.length} productos listos en ${new URL(url).pathname.slice(1)}`);
  console.log(
    imagesUrl ? `Fotos desde ${imagesUrl}` : 'Sin PRODUCT_IMAGES_URL: productos sin foto',
  );
} finally {
  await prisma.$disconnect();
}
