import type { Category, Product } from '../domain/index.js';

/**
 * PUERTO de salida: lo que la aplicación necesita para guardar y leer
 * productos, sin decir CÓMO. El adaptador (memoria hoy, Prisma + MySQL
 * después) implementa esta interfaz.
 */
export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  search(criteria: ProductSearchCriteria): Promise<ProductPage>;
  /**
   * Inserta (version 0) o actualiza con bloqueo optimista: si la versión
   * guardada ya no coincide, lanza ConcurrencyError.
   */
  save(product: Product): Promise<void>;
  /** Como save, pero todo o nada (una transacción en bases de datos reales). */
  saveAll(products: Product[]): Promise<void>;
}

export interface ProductSearchCriteria {
  query?: string | undefined;
  category?: Category | undefined;
  page: number;
  pageSize: number;
}

export interface ProductPage {
  items: Product[];
  total: number;
}

/** Token de inyección: Nest lo usa para saber qué adaptador entregar. */
export const PRODUCT_REPOSITORY = Symbol('ProductRepository');
