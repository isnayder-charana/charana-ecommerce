import { Order } from '../domain/index.js';
import { InMemoryOutboxStore } from '../infrastructure/persistence/in-memory-outbox.store.js';
import { InMemoryOrderRepository } from '../infrastructure/persistence/in-memory-order.repository.js';
import { type EventPublisher, type OrderEvent, toOrderEvents } from './order-events.js';
import { OUTBOX_BATCH_SIZE, PublishOutboxUseCase } from './publish-outbox.use-case.js';

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
        quantity: 2,
      },
    ],
    now: new Date('2026-11-10T12:00:00Z'),
  });

const event = (i: number): OrderEvent => ({
  id: `e-${i}`,
  type: 'OrderPlaced',
  occurredAt: new Date(Date.UTC(2026, 10, 10, 12, 0, i)).toISOString(),
  orderId: `o-${i}`,
  customerId: 'c-1',
  status: 'PENDING_PAYMENT',
  total: { cents: 100, currency: 'USD' },
});

/** Bus de prueba: guarda lo publicado y puede fallar a pedido. */
class RecordingPublisher implements EventPublisher {
  readonly published: OrderEvent[] = [];
  fail = false;
  async publish(events: OrderEvent[]): Promise<void> {
    if (this.fail) throw new Error('bus caído');
    this.published.push(...events);
  }
}

describe('toOrderEvents', () => {
  it('traduce los eventos de dominio a eventos de integración con una foto del pedido', () => {
    const order = place();
    order.markPaid(new Date('2026-11-10T12:05:00Z'));
    let n = 0;

    const events = toOrderEvents(order, order.pullEvents(), () => `id-${++n}`);

    expect(events).toEqual([
      {
        id: 'id-1',
        type: 'OrderPlaced',
        occurredAt: '2026-11-10T12:00:00.000Z',
        orderId: 'o-1',
        customerId: 'c-1',
        status: 'PAID',
        total: { cents: 11998, currency: 'USD' },
      },
      expect.objectContaining({
        id: 'id-2',
        type: 'OrderPaid',
        occurredAt: '2026-11-10T12:05:00.000Z',
      }),
    ]);
  });
});

describe('toOrderEvents con correo', () => {
  it('incluye el correo del cliente si el pedido lo tiene', () => {
    const order = Order.place({
      id: 'o-2',
      customerId: 'c-1',
      customerEmail: 'ana@correo.com',
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
    const [event] = toOrderEvents(order, order.pullEvents(), () => 'id-1');
    expect(event?.customerEmail).toBe('ana@correo.com');
  });
});

describe('InMemoryOrderRepository + outbox', () => {
  it('al guardar deja los eventos del pedido en la bandeja (y no los repite)', async () => {
    const repo = new InMemoryOrderRepository();
    await repo.save(place());
    const order = (await repo.findById('o-1'))!;
    order.markPaid(new Date('2026-11-10T12:05:00Z'));
    await repo.save(order);

    const pending = await repo.outbox.pending(10);
    expect(pending.map((e) => e.type)).toEqual(['OrderPlaced', 'OrderPaid']);
    expect(new Set(pending.map((e) => e.id)).size).toBe(2);
  });
});

describe('InMemoryOutboxStore', () => {
  it('entrega los más antiguos primero, respeta el límite y borra los publicados', async () => {
    const outbox = new InMemoryOutboxStore();
    outbox.add([event(3), event(1), event(2)]);

    expect((await outbox.pending(2)).map((e) => e.id)).toEqual(['e-1', 'e-2']);
    await outbox.remove([event(1)]);
    expect((await outbox.pending(10)).map((e) => e.id)).toEqual(['e-2', 'e-3']);
  });
});

describe('PublishOutboxUseCase (el relé)', () => {
  it('publica todo lo pendiente por tandas y vacía la bandeja', async () => {
    const outbox = new InMemoryOutboxStore();
    const total = OUTBOX_BATCH_SIZE * 2 + 3;
    outbox.add(Array.from({ length: total }, (_, i) => event(i)));
    const bus = new RecordingPublisher();

    expect(await new PublishOutboxUseCase(outbox, bus).execute()).toBe(total);
    expect(bus.published.map((e) => e.id)).toEqual(
      Array.from({ length: total }, (_, i) => `e-${i}`),
    );
    expect(await outbox.pending(10)).toEqual([]);
  });

  it('si el bus falla, NO borra nada: se reintenta en la próxima vuelta', async () => {
    const outbox = new InMemoryOutboxStore();
    outbox.add([event(1), event(2)]);
    const bus = new RecordingPublisher();
    bus.fail = true;
    const relay = new PublishOutboxUseCase(outbox, bus);

    await expect(relay.execute()).rejects.toThrow('bus caído');
    expect(await outbox.pending(10)).toHaveLength(2);

    bus.fail = false;
    expect(await relay.execute()).toBe(2);
  });

  it('con la bandeja vacía no publica nada', async () => {
    const bus = new RecordingPublisher();
    expect(await new PublishOutboxUseCase(new InMemoryOutboxStore(), bus).execute()).toBe(0);
    expect(bus.published).toEqual([]);
  });
});
