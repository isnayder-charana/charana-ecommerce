import { DeleteTableCommand, ResourceNotFoundException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Order } from '../../src/modules/orders/domain/index.js';
import { DynamoDbOrderEmailsReader } from '../../src/modules/orders/infrastructure/persistence/dynamodb-order-emails.reader.js';
import { DynamoDbOrderRepository } from '../../src/modules/orders/infrastructure/persistence/dynamodb-order.repository.js';
import { DynamoDbOutboxStore } from '../../src/modules/orders/infrastructure/persistence/dynamodb-outbox.repository.js';
import { DynamoDbProcessedEventStore } from '../../src/modules/orders/infrastructure/persistence/dynamodb-processed-event.repository.js';
import { ConcurrencyError } from '../../src/shared/domain/index.js';
import {
  createDynamoClient,
  type DynamoDBDocumentClient,
  ensureTable,
} from '../../src/shared/infrastructure/database/dynamodb.js';

const ENDPOINT = process.env.TEST_DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const TABLE = 'charanatech-test';

const line = {
  productId: 'p-1',
  sku: 'CT-AUD-001',
  name: 'Audífonos',
  unitPriceCents: 5999,
  currency: 'USD' as const,
  quantity: 2,
};

const place = (id: string, customerId: string, at: string) =>
  Order.place({ id, customerId, lines: [line], now: new Date(at) });

/**
 * Prueba el adaptador contra DynamoDB Local: claves, índice GSI1, orden por
 * fecha y escrituras condicionales (bloqueo optimista) con concurrencia real.
 */
describe('DynamoDbOrderRepository (DynamoDB Local)', () => {
  let client: DynamoDBDocumentClient;
  let repo: DynamoDbOrderRepository;

  beforeAll(async () => {
    client = createDynamoClient({ region: 'us-east-1', endpoint: ENDPOINT });
    repo = new DynamoDbOrderRepository(client, TABLE);
  });

  beforeEach(async () => {
    // Tabla nueva en cada test: estado limpio y predecible.
    try {
      await client.send(new DeleteTableCommand({ TableName: TABLE }));
    } catch (error) {
      if (!(error instanceof ResourceNotFoundException)) throw error;
    }
    await ensureTable(client, TABLE);
  });

  afterAll(() => {
    client.destroy();
  });

  it('guarda un pedido nuevo y lo lee completo (versión 1)', async () => {
    const order = place('o-1', 'c-1', '2026-11-10T12:00:00Z');
    await repo.save(order);

    const found = await repo.findById('o-1');
    expect(found?.toPrimitives()).toEqual({ ...order.toPrimitives(), version: 1 });
    expect(await repo.findById('no-existe')).toBeNull();
  });

  it('lista los pedidos de un cliente, del más nuevo al más viejo', async () => {
    await repo.save(place('o-1', 'c-1', '2026-11-08T10:00:00Z'));
    await repo.save(place('o-2', 'c-2', '2026-11-09T10:00:00Z'));
    await repo.save(place('o-3', 'c-1', '2026-11-10T10:00:00Z'));

    expect((await repo.findByCustomer('c-1')).map((o) => o.id)).toEqual(['o-3', 'o-1']);
    expect((await repo.findByCustomer('c-9')).length).toBe(0);
  });

  it('actualiza el estado e incrementa la versión', async () => {
    await repo.save(place('o-1', 'c-1', '2026-11-10T12:00:00Z'));

    const order = (await repo.findById('o-1'))!;
    order.markPaid(new Date('2026-11-10T12:05:00Z'));
    await repo.save(order);

    const paid = (await repo.findById('o-1'))!;
    expect(paid.status).toBe('PAID');
    expect(paid.version).toBe(2);
    expect(paid.history.map((h) => h.status)).toEqual(['PENDING_PAYMENT', 'PAID']);
  });

  it('rechaza guardar un pedido leído antes de otro cambio (bloqueo optimista)', async () => {
    await repo.save(place('o-1', 'c-1', '2026-11-10T12:00:00Z'));
    const a = (await repo.findById('o-1'))!;
    const b = (await repo.findById('o-1'))!;

    a.markPaid(new Date());
    await repo.save(a);

    b.cancel(new Date()); // b todavía cree que el pedido está PENDING_PAYMENT
    await expect(repo.save(b)).rejects.toBeInstanceOf(ConcurrencyError);
    expect((await repo.findById('o-1'))?.status).toBe('PAID');
  });

  it('no sobrescribe un pedido existente con el mismo id', async () => {
    await repo.save(place('o-1', 'c-1', '2026-11-10T12:00:00Z'));
    await expect(repo.save(place('o-1', 'c-2', '2026-11-10T13:00:00Z'))).rejects.toBeInstanceOf(
      ConcurrencyError,
    );
  });

  it('con 10 cancelaciones simultáneas del mismo pedido, solo una gana', async () => {
    await repo.save(place('o-1', 'c-1', '2026-11-10T12:00:00Z'));
    const copies = await Promise.all(Array.from({ length: 10 }, () => repo.findById('o-1')));

    const results = await Promise.allSettled(
      copies.map(async (order) => {
        order!.cancel(new Date());
        await repo.save(order!);
      }),
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    const conflicts = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof ConcurrencyError,
    );
    expect(ok.length).toBe(1);
    expect(conflicts.length).toBe(9);
    expect((await repo.findById('o-1'))?.version).toBe(2);
  });

  it('guarda la sesión de pago del pedido (paso 19)', async () => {
    const order = place('o-pago', 'c-1', '2026-11-15T12:00:00Z');
    order.attachPaymentSession('cs_test_123');
    await repo.save(order);
    expect((await repo.findById('o-pago'))!.paymentSessionId).toBe('cs_test_123');
  });

  it('recuerda los avisos de pago procesados, con fecha de expiración (TTL)', async () => {
    const store = new DynamoDbProcessedEventStore(
      client,
      TABLE,
      () => new Date('2026-11-15T00:00:00Z'),
    );
    expect(await store.has('evt_1')).toBe(false);
    await store.record('evt_1');
    await store.record('evt_1'); // registrar dos veces no falla
    expect(await store.has('evt_1')).toBe(true);
    expect(await store.has('evt_2')).toBe(false);

    const { Item } = await client.send(
      new GetCommand({ TableName: TABLE, Key: { PK: 'PAYMENT_EVENT#evt_1', SK: 'PAYMENT_EVENT' } }),
    );
    // 30 días después, en segundos (así lo exige el TTL de DynamoDB).
    expect(Item!.expiresAt).toBe(Date.parse('2026-12-15T00:00:00Z') / 1000);
  });

  describe('outbox (paso 22)', () => {
    it('guarda el pedido y sus eventos en la misma transacción', async () => {
      const outbox = new DynamoDbOutboxStore(client, TABLE);
      await repo.save(place('o-1', 'c-1', '2026-11-10T12:00:00Z'));
      const order = (await repo.findById('o-1'))!;
      order.markPaid(new Date('2026-11-10T12:05:00Z'));
      await repo.save(order);

      const pending = await outbox.pending(10);
      expect(pending.map((e) => [e.type, e.orderId, e.status])).toEqual([
        ['OrderPlaced', 'o-1', 'PENDING_PAYMENT'],
        ['OrderPaid', 'o-1', 'PAID'],
      ]);
      expect(pending[0]!.total).toEqual({ cents: 11998, currency: 'USD' });
    });

    it('si el bloqueo optimista falla, NO deja eventos huérfanos', async () => {
      const outbox = new DynamoDbOutboxStore(client, TABLE);
      await repo.save(place('o-1', 'c-1', '2026-11-10T12:00:00Z'));
      const a = (await repo.findById('o-1'))!;
      const b = (await repo.findById('o-1'))!;
      a.markPaid(new Date('2026-11-10T12:05:00Z'));
      await repo.save(a);
      b.cancel(new Date('2026-11-10T12:06:00Z'));

      await expect(repo.save(b)).rejects.toBeInstanceOf(ConcurrencyError);
      expect((await outbox.pending(10)).map((e) => e.type)).toEqual(['OrderPlaced', 'OrderPaid']);
    });

    it('entrega los más antiguos primero, respeta el límite y borra los publicados', async () => {
      const outbox = new DynamoDbOutboxStore(client, TABLE);
      for (let i = 0; i < 30; i++) {
        const at = new Date(Date.UTC(2026, 10, 10, 12, i)).toISOString();
        await repo.save(place(`o-${String(i).padStart(2, '0')}`, 'c-1', at));
      }

      const first = await outbox.pending(25);
      expect(first.map((e) => e.orderId)).toEqual(
        Array.from({ length: 25 }, (_, i) => `o-${String(i).padStart(2, '0')}`),
      );
      await outbox.remove(first);
      expect((await outbox.pending(25)).map((e) => e.orderId)).toEqual([
        'o-25',
        'o-26',
        'o-27',
        'o-28',
        'o-29',
      ]);
    });
  });

  it('lee los correos que guardó el worker, del más antiguo al más nuevo', async () => {
    // Así los escribe DynamoDbOrderEmailLog en apps/workers.
    const put = (eventId: string, occurredAt: string, delivered: boolean) =>
      client.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: 'ORDER_EMAIL#o-1',
            SK: `${occurredAt}#${eventId}`,
            entity: 'OrderEmail',
            orderId: 'o-1',
            eventId,
            occurredAt,
            subject: `Asunto ${eventId}`,
            text: 'Texto',
            delivered,
            expiresAt: 0,
          },
        }),
      );
    await put('e-2', '2026-11-10T12:05:00.000Z', false);
    await put('e-1', '2026-11-10T12:00:00.000Z', true);

    const reader = new DynamoDbOrderEmailsReader(client, TABLE);
    expect(await reader.findByOrder('o-1')).toEqual([
      {
        subject: 'Asunto e-1',
        text: 'Texto',
        occurredAt: '2026-11-10T12:00:00.000Z',
        delivered: true,
      },
      {
        subject: 'Asunto e-2',
        text: 'Texto',
        occurredAt: '2026-11-10T12:05:00.000Z',
        delivered: false,
      },
    ]);
    expect(await reader.findByOrder('otro')).toEqual([]);
  });
});
