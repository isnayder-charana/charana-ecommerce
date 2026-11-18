import { ProductNotFoundError, SkuAlreadyExistsError } from '../domain/index.js';
import { InMemoryProductRepository } from '../infrastructure/persistence/in-memory-product.repository.js';
import { PRODUCT_SEED } from '../infrastructure/persistence/product.seed.js';
import { CreateProductUseCase } from './create-product.use-case.js';
import { GetProductUseCase } from './get-product.use-case.js';
import { ListProductsUseCase } from './list-products.use-case.js';

/**
 * Los casos de uso se prueban con el adaptador en memoria: rápidos,
 * sin base de datos y sin Nest. Esa es la ventaja de los puertos.
 */
describe('Casos de uso de Catalog', () => {
  let repo: InMemoryProductRepository;

  beforeEach(() => {
    repo = new InMemoryProductRepository(PRODUCT_SEED);
  });

  describe('ListProducts', () => {
    it('pagina los resultados ordenados por nombre', async () => {
      const result = await new ListProductsUseCase(repo).execute({ page: 2, pageSize: 4 });
      expect(result).toMatchObject({ page: 2, pageSize: 4, total: 6, totalPages: 2 });
      expect(result.items).toHaveLength(2);
    });

    it('filtra por categoría y por texto', async () => {
      const list = new ListProductsUseCase(repo);
      const perifericos = await list.execute({ category: 'perifericos', page: 1, pageSize: 10 });
      expect(perifericos.total).toBe(2);

      const usbc = await list.execute({ query: 'usb-c', page: 1, pageSize: 10 });
      expect(usbc.items.map((p) => p.sku).sort()).toEqual([
        'CT-CAB-001',
        'CT-CHG-001',
        'CT-STO-001',
      ]);
    });
  });

  describe('GetProduct', () => {
    it('devuelve el producto con su precio y disponibilidad', async () => {
      const view = await new GetProductUseCase(repo).execute({ id: PRODUCT_SEED[4]!.id });
      expect(view).toMatchObject({
        sku: 'CT-PER-002',
        price: { cents: 3999, currency: 'USD' },
        inStock: false,
      });
    });

    it('falla si no existe', async () => {
      await expect(new GetProductUseCase(repo).execute({ id: 'nope' })).rejects.toThrow(
        ProductNotFoundError,
      );
    });
  });

  describe('CreateProduct', () => {
    const input = {
      sku: 'ct-fun-001',
      name: 'Funda MagSafe',
      description: 'Silicona',
      category: 'fundas' as const,
      priceCents: 1999,
      currency: 'USD' as const,
      stock: 30,
    };

    it('crea y guarda el producto con un id nuevo', async () => {
      const view = await new CreateProductUseCase(repo, () => 'new-id').execute(input);
      expect(view).toMatchObject({ id: 'new-id', sku: 'CT-FUN-001' });
      expect(await repo.findById('new-id')).not.toBeNull();
    });

    it('no permite SKU duplicados', async () => {
      const create = new CreateProductUseCase(repo, () => 'x');
      await expect(create.execute({ ...input, sku: 'CT-AUD-001' })).rejects.toThrow(
        SkuAlreadyExistsError,
      );
    });
  });
});
