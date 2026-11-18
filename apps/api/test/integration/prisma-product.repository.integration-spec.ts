import {
  InsufficientStockError,
  Product,
  SkuAlreadyExistsError,
} from '../../src/modules/catalog/domain/index.js';
import { PrismaProductRepository } from '../../src/modules/catalog/infrastructure/persistence/prisma-product.repository.js';
import { PRODUCT_SEED } from '../../src/modules/catalog/infrastructure/persistence/product.seed.js';
import { CatalogStockGateway } from '../../src/modules/orders/infrastructure/catalog/catalog-stock.gateway.js';
import { ConcurrencyError } from '../../src/shared/domain/index.js';
import {
  createPrismaClient,
  type PrismaClient,
} from '../../src/shared/infrastructure/database/prisma.js';

/**
 * Prueba el adaptador contra un MySQL de verdad. Aquí se comprueba lo que un
 * repositorio en memoria no puede demostrar: índices, FULLTEXT, transacciones
 * y bloqueo optimista bajo concurrencia real.
 */
describe('PrismaProductRepository (MySQL)', () => {
  let prisma: PrismaClient;
  let repo: PrismaProductRepository;
  const audifonos = PRODUCT_SEED[0]!;
  const cargador = PRODUCT_SEED[1]!;

  beforeAll(() => {
    prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
    repo = new PrismaProductRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.product.deleteMany();
    await prisma.product.createMany({ data: PRODUCT_SEED });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lee por id y por SKU', async () => {
    expect((await repo.findById(audifonos.id))?.sku.value).toBe('CT-AUD-001');
    expect((await repo.findBySku('CT-CHG-001'))?.id).toBe(cargador.id);
    expect(await repo.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('inserta un producto nuevo con versión 1', async () => {
    const product = Product.create({
      id: '11111111-1111-4111-8111-111111111111',
      sku: 'CT-FUN-001',
      name: 'Funda MagSafe',
      description: 'Silicona',
      category: 'fundas',
      priceCents: 1999,
      currency: 'USD',
      stock: 5,
    });
    await repo.save(product);
    expect((await repo.findById(product.id))?.toPrimitives()).toMatchObject({
      sku: 'CT-FUN-001',
      version: 1,
    });
  });

  it('traduce un SKU duplicado (índice único) a SkuAlreadyExistsError', async () => {
    const duplicate = Product.create({
      id: '22222222-2222-4222-8222-222222222222',
      sku: 'CT-AUD-001',
      name: 'Copia',
      description: '',
      category: 'audio',
      priceCents: 100,
      currency: 'USD',
      stock: 1,
    });
    await expect(repo.save(duplicate)).rejects.toThrow(SkuAlreadyExistsError);
  });

  describe('búsqueda', () => {
    it('usa el índice FULLTEXT y exige todas las palabras', async () => {
      const usbc = await repo.search({ query: 'usb-c', page: 1, pageSize: 10 });
      expect(usbc.items.map((p) => p.sku.value).sort()).toEqual([
        'CT-CAB-001',
        'CT-CHG-001',
        'CT-STO-001',
      ]);

      const cableUsb = await repo.search({ query: 'cable usb', page: 1, pageSize: 10 });
      expect(cableUsb.items.map((p) => p.sku.value)).toEqual(['CT-CAB-001']);
    });

    it('busca por prefijo ("teclad" encuentra "Teclado")', async () => {
      const result = await repo.search({ query: 'teclad', page: 1, pageSize: 10 });
      expect(result.items.map((p) => p.sku.value)).toEqual(['CT-PER-001']);
    });

    it('filtra por categoría, ordena por nombre y pagina', async () => {
      const page2 = await repo.search({ category: 'perifericos', page: 2, pageSize: 1 });
      expect(page2.total).toBe(2);
      expect(page2.items.map((p) => p.name)).toEqual(['Teclado mecánico compacto']);
    });

    it('ignora símbolos que cambiarían la búsqueda booleana', async () => {
      const result = await repo.search({ query: '-* "+', page: 1, pageSize: 10 });
      expect(result.total).toBe(6);
    });
  });

  describe('bloqueo optimista', () => {
    it('rechaza guardar una copia vieja del producto', async () => {
      const first = (await repo.findById(audifonos.id))!;
      const second = (await repo.findById(audifonos.id))!;

      first.reserveStock(1);
      await repo.save(first); // versión 1 → 2

      second.reserveStock(1); // todavía cree que es la versión 1
      await expect(repo.save(second)).rejects.toThrow(ConcurrencyError);
      expect((await repo.findById(audifonos.id))?.stock).toBe(audifonos.stock - 1);
    });

    it('saveAll es todo o nada: si uno falla, MySQL deshace los demás', async () => {
      const a = (await repo.findById(audifonos.id))!;
      const stale = (await repo.findById(cargador.id))!;
      const fresh = (await repo.findById(cargador.id))!;
      fresh.reserveStock(1);
      await repo.save(fresh);

      a.reserveStock(5);
      stale.reserveStock(5);
      await expect(repo.saveAll([a, stale])).rejects.toThrow(ConcurrencyError);
      expect((await repo.findById(audifonos.id))?.stock).toBe(audifonos.stock); // sin cambios
    });

    it('con 10 compras simultáneas nunca vende más stock del que hay', async () => {
      const gateway = new CatalogStockGateway(repo);
      // Stock 25, cada compra pide 3 → solo 8 pueden completarse.
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          gateway.reserve([{ productId: audifonos.id, quantity: 3 }]),
        ),
      );

      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const sinStock = results.filter(
        (r) => r.status === 'rejected' && r.reason instanceof InsufficientStockError,
      ).length;
      const stock = (await repo.findById(audifonos.id))!.stock;

      expect(stock).toBe(audifonos.stock - ok * 3);
      expect(stock).toBeGreaterThanOrEqual(0);
      expect(ok + sinStock).toBe(10); // ninguna terminó en un error de concurrencia
    });
  });
});
