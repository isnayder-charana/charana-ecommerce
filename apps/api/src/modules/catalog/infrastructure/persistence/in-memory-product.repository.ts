import type {
  ProductPage,
  ProductRepository,
  ProductSearchCriteria,
} from '../../application/product.repository.js';
import { ConcurrencyError } from '../../../../shared/domain/index.js';
import { Product, type ProductPrimitives } from '../../domain/index.js';

/**
 * ADAPTADOR en memoria del puerto ProductRepository. Sirve para
 * desarrollar y testear sin base de datos. Guarda primitivos (como haría
 * una BD real) y aplica el mismo bloqueo optimista que el adaptador de Prisma.
 */
export class InMemoryProductRepository implements ProductRepository {
  private readonly rows = new Map<string, ProductPrimitives>();

  constructor(seed: ProductPrimitives[] = []) {
    for (const row of seed) this.rows.set(row.id, { ...row });
  }

  async findById(id: string): Promise<Product | null> {
    const row = this.rows.get(id);
    return row ? Product.fromPrimitives(row) : null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    const row = [...this.rows.values()].find((r) => r.sku === sku);
    return row ? Product.fromPrimitives(row) : null;
  }

  async search({ query, category, page, pageSize }: ProductSearchCriteria): Promise<ProductPage> {
    const q = query?.trim().toLowerCase();
    const matches = [...this.rows.values()]
      .filter((r) => !category || r.category === category)
      .filter((r) => !q || `${r.name} ${r.description}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    const start = (page - 1) * pageSize;
    return {
      items: matches.slice(start, start + pageSize).map((r) => Product.fromPrimitives(r)),
      total: matches.length,
    };
  }

  async save(product: Product): Promise<void> {
    await this.saveAll([product]);
  }

  async saveAll(products: Product[]): Promise<void> {
    // Primero validamos TODAS las versiones; solo después escribimos (todo o nada).
    for (const product of products) {
      const stored = this.rows.get(product.id);
      if ((stored?.version ?? 0) !== product.version) {
        throw new ConcurrencyError('Product', product.id);
      }
    }
    for (const product of products) {
      this.rows.set(product.id, { ...product.toPrimitives(), version: product.version + 1 });
    }
  }
}
