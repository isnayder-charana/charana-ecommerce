import { ConcurrencyError } from '../../../../shared/domain/index.js';
import type { PrismaClient } from '../../../../shared/infrastructure/database/prisma.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type {
  ProductPage,
  ProductRepository,
  ProductSearchCriteria,
} from '../../application/product.repository.js';
import {
  type Category,
  type Currency,
  Product,
  SkuAlreadyExistsError,
} from '../../domain/index.js';

type ProductRow = Prisma.ProductModel;
/** Un cliente normal o uno dentro de una transacción: ambos tienen `product`. */
type Db = Pick<PrismaClient, 'product'>;

/**
 * ADAPTADOR de MySQL (vía Prisma) del puerto ProductRepository.
 * Traduce filas de la tabla `products` a agregados Product y viceversa.
 */
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { sku } });
    return row ? toDomain(row) : null;
  }

  async search({ query, category, page, pageSize }: ProductSearchCriteria): Promise<ProductPage> {
    const where: Prisma.ProductWhereInput = { ...(category && { category }) };

    const fulltext = toFulltextQuery(query);
    if (fulltext) {
      // MATCH(name, description) AGAINST(... IN BOOLEAN MODE) usando el índice FULLTEXT.
      where.name = { search: fulltext };
      where.description = { search: fulltext };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map(toDomain), total };
  }

  async save(product: Product): Promise<void> {
    await write(this.prisma, product);
  }

  async saveAll(products: Product[]): Promise<void> {
    // Transacción interactiva: si una escritura falla, MySQL deshace todas.
    await this.prisma.$transaction(async (tx) => {
      for (const product of products) await write(tx, product);
    });
  }
}

async function write(db: Db, product: Product): Promise<void> {
  const { version, ...data } = product.toPrimitives();

  if (version === 0) {
    try {
      await db.product.create({ data: { ...data, version: 1 } });
    } catch (error) {
      // P2002 = violación de índice único (dos altas simultáneas con el mismo SKU).
      if ((error as { code?: string }).code === 'P2002') throw new SkuAlreadyExistsError(data.sku);
      throw error;
    }
    return;
  }

  // Bloqueo optimista: solo actualiza si nadie cambió la fila desde que la leímos.
  // UPDATE products SET ..., version = version + 1 WHERE id = ? AND version = ?
  const { count } = await db.product.updateMany({
    where: { id: product.id, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (count === 0) throw new ConcurrencyError('Product', product.id);
}

function toDomain(row: ProductRow): Product {
  return Product.fromPrimitives({
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    category: row.category as Category,
    priceCents: row.priceCents,
    currency: row.currency as Currency,
    stock: row.stock,
    imageUrl: row.imageUrl,
    version: row.version,
  });
}

/**
 * Convierte lo que escribe el usuario en una búsqueda booleana segura de MySQL.
 * "Cable USB-C" → "+cable* +usb*". Así evitamos que caracteres como "-" o "*"
 * cambien el significado de la búsqueda, y exigimos que aparezcan todas las palabras.
 * MySQL ignora palabras de menos de 3 letras, así que las descartamos.
 */
export function toFulltextQuery(query: string | undefined): string | null {
  const terms = (query ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3);
  return terms.length > 0 ? terms.map((t) => `+${t}*`).join(' ') : null;
}
