import type { ProductRepository } from '../../../catalog/application/product.repository.js';
import { type Product, ProductNotFoundError } from '../../../catalog/domain/index.js';
import { ConcurrencyError } from '../../../../shared/domain/index.js';
import type { ReservedItem, StockGateway, StockRequest } from '../../application/stock.gateway.js';

const MAX_ATTEMPTS = 5;

/**
 * ADAPTADOR del puerto StockGateway que habla con el módulo Catalog
 * dentro del mismo proceso. Es una "capa anticorrupción": traduce el
 * modelo de Catalog (Product) al que Orders necesita (ReservedItem).
 *
 * Concurrencia: si dos compras tocan el mismo producto a la vez, una de
 * ellas recibe ConcurrencyError al guardar (bloqueo optimista). En ese caso
 * se espera un instante al azar (para no chocar otra vez con la misma
 * petición), se vuelve a leer el stock actualizado y se reintenta hasta 5 veces.
 */
export class CatalogStockGateway implements StockGateway {
  constructor(private readonly products: ProductRepository) {}

  async reserve(items: StockRequest[]): Promise<ReservedItem[]> {
    return this.withRetry(async () => {
      const loaded = await this.load(items);
      for (const { product, quantity } of loaded) product.reserveStock(quantity);
      await this.products.saveAll(loaded.map((l) => l.product)); // todo o nada

      return loaded.map(({ product, quantity }) => ({
        productId: product.id,
        sku: product.sku.value,
        name: product.name,
        unitPriceCents: product.price.cents,
        currency: product.price.currency,
        quantity,
      }));
    });
  }

  async release(items: StockRequest[]): Promise<void> {
    await this.withRetry(async () => {
      const loaded = await this.load(items, { skipMissing: true });
      for (const { product, quantity } of loaded) product.releaseStock(quantity);
      await this.products.saveAll(loaded.map((l) => l.product));
    });
  }

  private async load(
    items: StockRequest[],
    { skipMissing = false } = {},
  ): Promise<{ product: Product; quantity: number }[]> {
    const loaded: { product: Product; quantity: number }[] = [];
    for (const { productId, quantity } of items) {
      const product = await this.products.findById(productId);
      if (product) loaded.push({ product, quantity });
      // Al devolver stock, un producto borrado simplemente se ignora.
      else if (!skipMissing) throw new ProductNotFoundError(productId);
    }
    return loaded;
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (!(error instanceof ConcurrencyError) || attempt >= MAX_ATTEMPTS) throw error;
        await sleep(Math.random() * 20 * attempt);
      }
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
