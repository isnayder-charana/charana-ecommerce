import { ConcurrencyError } from '../../../../shared/domain/index.js';
import { InMemoryProductRepository } from './in-memory-product.repository.js';
import { PRODUCT_SEED } from './product.seed.js';

describe('InMemoryProductRepository: bloqueo optimista', () => {
  const [a, b] = PRODUCT_SEED.map((p) => p.id) as [string, string];

  it('incrementa la versión en cada escritura', async () => {
    const repo = new InMemoryProductRepository(PRODUCT_SEED);
    const product = (await repo.findById(a))!;
    await repo.save(product);
    expect((await repo.findById(a))!.version).toBe(product.version + 1);
  });

  it('rechaza una copia vieja y no escribe nada del lote', async () => {
    const repo = new InMemoryProductRepository(PRODUCT_SEED);
    const stale = (await repo.findById(a))!;
    await repo.save((await repo.findById(a))!);

    const other = (await repo.findById(b))!;
    other.reserveStock(1);
    await expect(repo.saveAll([other, stale])).rejects.toThrow(ConcurrencyError);
    expect((await repo.findById(b))!.stock).toBe(PRODUCT_SEED[1]!.stock);
  });
});
