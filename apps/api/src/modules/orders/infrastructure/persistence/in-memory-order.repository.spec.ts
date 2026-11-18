import { ConcurrencyError } from '../../../../shared/domain/index.js';
import { Order } from '../../domain/index.js';
import { InMemoryOrderRepository } from './in-memory-order.repository.js';

const place = (id = 'o-1') =>
  Order.place({
    id,
    customerId: 'c-1',
    lines: [
      {
        productId: 'p-1',
        sku: 'CT-AUD-001',
        name: 'Audífonos',
        unitPriceCents: 5999,
        currency: 'USD',
        quantity: 1,
      },
    ],
    now: new Date('2026-11-10T12:00:00Z'),
  });

describe('InMemoryOrderRepository (bloqueo optimista)', () => {
  it('incrementa la versión en cada escritura', async () => {
    const repo = new InMemoryOrderRepository();
    await repo.save(place());
    const order = (await repo.findById('o-1'))!;
    expect(order.version).toBe(1);

    order.markPaid(new Date());
    await repo.save(order);
    expect((await repo.findById('o-1'))?.version).toBe(2);
  });

  it('rechaza un pedido desactualizado o un id repetido', async () => {
    const repo = new InMemoryOrderRepository();
    await repo.save(place());
    const a = (await repo.findById('o-1'))!;
    const b = (await repo.findById('o-1'))!;

    a.markPaid(new Date());
    await repo.save(a);
    b.cancel(new Date());

    await expect(repo.save(b)).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(repo.save(place())).rejects.toBeInstanceOf(ConcurrencyError);
  });
});
