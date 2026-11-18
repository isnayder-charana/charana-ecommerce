import { ConcurrencyError } from '../../../shared/domain/index.js';
import { InvalidOrderTransitionError, Order, OrderNotFoundError } from '../domain/index.js';
import { InMemoryOrderRepository } from '../infrastructure/persistence/in-memory-order.repository.js';
import { FulfillOrderUseCase } from './fulfill-order.use-case.js';

const t0 = new Date('2026-11-18T12:00:00Z');

async function setup(status: 'PENDING_PAYMENT' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED') {
  const orders = new InMemoryOrderRepository();
  const order = Order.place({
    id: 'o-1',
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
    now: t0,
  });
  if (status === 'CANCELLED') order.cancel(t0);
  if (['PAID', 'SHIPPED', 'DELIVERED'].includes(status)) order.markPaid(t0);
  if (['SHIPPED', 'DELIVERED'].includes(status)) order.ship(t0);
  if (status === 'DELIVERED') order.deliver(t0);
  await orders.save(order);
  const fulfill = new FulfillOrderUseCase(orders, () => new Date('2026-11-18T12:01:00Z'));
  return { orders, fulfill };
}

describe('FulfillOrderUseCase', () => {
  it('envía un pedido pagado y entrega uno enviado, dejando el historial', async () => {
    const { orders, fulfill } = await setup('PAID');

    expect(await fulfill.execute({ id: 'o-1', step: 'ship' })).toEqual({
      status: 'SHIPPED',
      changed: true,
    });
    expect(await fulfill.execute({ id: 'o-1', step: 'deliver' })).toEqual({
      status: 'DELIVERED',
      changed: true,
    });
    const order = await orders.findById('o-1');
    expect(order?.history.map((h) => h.status)).toEqual([
      'PENDING_PAYMENT',
      'PAID',
      'SHIPPED',
      'DELIVERED',
    ]);
    // Cada cambio deja su evento para los correos (paso 24).
    expect((await orders.outbox.pending(10)).map((e) => e.type)).toEqual([
      'OrderPlaced',
      'OrderPaid',
      'OrderShipped',
      'OrderDelivered',
    ]);
  });

  it.each([
    ['SHIPPED', 'ship'],
    ['DELIVERED', 'ship'],
    ['DELIVERED', 'deliver'],
    ['CANCELLED', 'ship'],
    ['CANCELLED', 'deliver'],
  ] as const)(
    'con el pedido %s, "%s" no cambia nada (evento repetido o cancelado)',
    async (status, step) => {
      const { orders, fulfill } = await setup(status);
      const before = (await orders.findById('o-1'))?.version;

      expect(await fulfill.execute({ id: 'o-1', step })).toEqual({ status, changed: false });
      expect((await orders.findById('o-1'))?.version).toBe(before);
    },
  );

  it('la máquina de estados sigue mandando: no se entrega lo que no se envió', async () => {
    const { fulfill } = await setup('PAID');
    await expect(fulfill.execute({ id: 'o-1', step: 'deliver' })).rejects.toThrow(
      InvalidOrderTransitionError,
    );
    const unpaid = await setup('PENDING_PAYMENT');
    await expect(unpaid.fulfill.execute({ id: 'o-1', step: 'ship' })).rejects.toThrow(
      InvalidOrderTransitionError,
    );
  });

  it('falla si el pedido no existe', async () => {
    const { fulfill } = await setup('PAID');
    await expect(fulfill.execute({ id: 'nope', step: 'ship' })).rejects.toThrow(OrderNotFoundError);
  });

  it('si el cliente cancela al mismo tiempo, gana uno y el otro recibe ConcurrencyError', async () => {
    const { orders, fulfill } = await setup('PAID');
    const stale = (await orders.findById('o-1'))!;
    stale.cancel(t0);
    await fulfill.execute({ id: 'o-1', step: 'ship' });
    await expect(orders.save(stale)).rejects.toThrow(ConcurrencyError);
  });
});
