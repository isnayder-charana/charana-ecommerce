import { ConcurrencyError } from '../../../shared/domain/index.js';
import { InsufficientStockError, ProductNotFoundError } from '../../catalog/domain/index.js';
import { InMemoryProductRepository } from '../../catalog/infrastructure/persistence/in-memory-product.repository.js';
import { PRODUCT_SEED } from '../../catalog/infrastructure/persistence/product.seed.js';
import {
  InvalidOrderError,
  InvalidOrderTransitionError,
  OrderNotFoundError,
  OrderNotPayableError,
} from '../domain/index.js';
import { CatalogStockGateway } from '../infrastructure/catalog/catalog-stock.gateway.js';
import { InMemoryProcessedEventStore } from '../infrastructure/persistence/in-memory-processed-event.store.js';
import { FakePaymentGateway } from '../infrastructure/payments/fake-payment.gateway.js';
import { UnconfiguredPaymentGateway } from '../infrastructure/payments/unconfigured-payment.gateway.js';
import { InMemoryOrderRepository } from '../infrastructure/persistence/in-memory-order.repository.js';
import { InMemoryOrderEmailsReader } from '../infrastructure/persistence/in-memory-order-emails.reader.js';
import { ListOrderEmailsUseCase } from './list-order-emails.use-case.js';
import { AdvanceOrderStatusUseCase } from './advance-order-status.use-case.js';
import { CancelOrderUseCase } from './cancel-order.use-case.js';
import { GetOrderUseCase } from './get-order.use-case.js';
import { ListMyOrdersUseCase } from './list-my-orders.use-case.js';
import { PaymentsNotConfiguredError } from './payment.gateway.js';
import { HandlePaymentEventUseCase } from './handle-payment-event.use-case.js';
import type { PaymentEvent } from './payment-event.js';
import { PlaceOrderUseCase } from './place-order.use-case.js';
import { StartCheckoutUseCase } from './start-checkout.use-case.js';

const [audifonos, cargador, , , mouseSinStock] = PRODUCT_SEED.map((p) => p.id) as string[];

describe('Casos de uso de Orders', () => {
  let products: InMemoryProductRepository;
  let orders: InMemoryOrderRepository;
  let stock: CatalogStockGateway;
  let payments: FakePaymentGateway;
  let ids: number;
  let minutes: number;
  const clock = () => new Date(Date.UTC(2026, 10, 10, 12, minutes++));
  const newId = () => `o-${++ids}`;
  const stockOf = async (id: string) => (await products.findById(id))!.stock;

  beforeEach(() => {
    products = new InMemoryProductRepository(PRODUCT_SEED);
    orders = new InMemoryOrderRepository();
    stock = new CatalogStockGateway(products);
    payments = new FakePaymentGateway();
    ids = 0;
    minutes = 0;
  });

  const place = (items = [{ productId: audifonos!, quantity: 2 }], customerId = 'c-1') =>
    new PlaceOrderUseCase(orders, stock, newId, clock).execute({ customerId, items });

  describe('PlaceOrder', () => {
    it('crea el pedido con el precio actual y descuenta stock', async () => {
      const view = await place([
        { productId: audifonos!, quantity: 2 },
        { productId: cargador!, quantity: 1 },
      ]);
      expect(view).toMatchObject({
        id: 'o-1',
        status: 'PENDING_PAYMENT',
        total: { cents: 5999 * 2 + 3499 },
      });
      expect(await stockOf(audifonos!)).toBe(23);
      expect(await stockOf(cargador!)).toBe(39);
    });

    it('es todo o nada: si un producto no tiene stock no reserva ninguno', async () => {
      await expect(
        place([
          { productId: audifonos!, quantity: 1 },
          { productId: mouseSinStock!, quantity: 1 },
        ]),
      ).rejects.toThrow(InsufficientStockError);
      expect(await stockOf(audifonos!)).toBe(25);
      expect(await orders.findByCustomer('c-1')).toEqual([]);
    });

    it('falla si el producto no existe', async () => {
      await expect(place([{ productId: 'nope', quantity: 1 }])).rejects.toThrow(
        ProductNotFoundError,
      );
    });

    it('devuelve el stock si el dominio rechaza el pedido después de reservar', async () => {
      await expect(place([{ productId: audifonos!, quantity: 11 }])).rejects.toThrow(
        InvalidOrderError,
      );
      expect(await stockOf(audifonos!)).toBe(25);
    });

    it('rechaza un pedido vacío sin tocar el stock', async () => {
      await expect(place([])).rejects.toThrow(InvalidOrderError);
    });
  });

  describe('GetOrder y ListMyOrders', () => {
    it('cada cliente solo ve sus pedidos, del más nuevo al más antiguo', async () => {
      await place(undefined, 'c-1');
      await place(undefined, 'c-1');
      await place(undefined, 'c-2');

      const mine = await new ListMyOrdersUseCase(orders).execute({ customerId: 'c-1' });
      expect(mine.map((o) => o.id)).toEqual(['o-2', 'o-1']);

      const get = new GetOrderUseCase(orders);
      await expect(get.execute({ id: 'o-1', customerId: 'c-1' })).resolves.toMatchObject({
        id: 'o-1',
      });
      await expect(get.execute({ id: 'o-3', customerId: 'c-1' })).rejects.toThrow(
        OrderNotFoundError,
      );
      await expect(get.execute({ id: 'zzz', customerId: 'c-1' })).rejects.toThrow(
        OrderNotFoundError,
      );
    });
  });

  describe('ListOrderEmails', () => {
    it('devuelve los correos de mi pedido en orden, y "no existe" si el pedido es de otro', async () => {
      await place(undefined, 'c-1');
      const emails = new InMemoryOrderEmailsReader();
      const shipped = {
        subject: 'Tu pedido va en camino',
        text: '...',
        occurredAt: '2026-11-10T12:05:00.000Z',
        delivered: false,
      };
      const paid = {
        ...shipped,
        subject: 'Recibimos tu pago',
        occurredAt: '2026-11-10T12:01:00.000Z',
      };
      emails.add('o-1', shipped);
      emails.add('o-1', paid);
      const list = new ListOrderEmailsUseCase(orders, emails);

      await expect(list.execute({ id: 'o-1', customerId: 'c-1' })).resolves.toEqual([
        paid,
        shipped,
      ]);
      await expect(list.execute({ id: 'o-1', customerId: 'c-2' })).rejects.toThrow(
        OrderNotFoundError,
      );
    });
  });

  describe('CancelOrder', () => {
    it('cancela y devuelve el stock', async () => {
      await place();
      const view = await new CancelOrderUseCase(orders, stock, payments, clock).execute({
        id: 'o-1',
        customerId: 'c-1',
      });
      expect(view.status).toBe('CANCELLED');
      expect(await stockOf(audifonos!)).toBe(25);
    });

    it('si tenía una sesión de pago abierta, la cierra para que ya no se pueda pagar', async () => {
      await place();
      const session = await payments.createCheckout({ orderId: 'o-1' } as never);
      const order = (await orders.findById('o-1'))!;
      order.attachPaymentSession(session.id);
      await orders.save(order);

      await new CancelOrderUseCase(orders, stock, payments, clock).execute({
        id: 'o-1',
        customerId: 'c-1',
      });
      expect(payments.expired).toEqual([session.id]);
      expect(await payments.findOpenCheckout(session.id)).toBeNull();
      expect(payments.refunded.size).toBe(0); // nunca se pagó: no hay nada que devolver
    });

    it('si ya estaba pagado, devuelve el dinero', async () => {
      await place();
      const order = (await orders.findById('o-1'))!;
      order.attachPaymentSession('cs_pagada');
      order.markPaid(clock());
      await orders.save(order);

      const view = await new CancelOrderUseCase(orders, stock, payments, clock).execute({
        id: 'o-1',
        customerId: 'c-1',
      });
      expect(view.status).toBe('CANCELLED');
      expect([...payments.refunded]).toEqual(['cs_pagada']);
      expect(await stockOf(audifonos!)).toBe(25);
    });

    it('no deja cancelar pedidos ajenos', async () => {
      await place();
      await expect(
        new CancelOrderUseCase(orders, stock, payments, clock).execute({
          id: 'o-1',
          customerId: 'c-2',
        }),
      ).rejects.toThrow(OrderNotFoundError);
    });

    it('reintenta si otra compra modificó el producto al mismo tiempo', async () => {
      const realSaveAll = products.saveAll.bind(products);
      let calls = 0;
      products.saveAll = async (items) => {
        calls++;
        if (calls === 1) throw new ConcurrencyError('Product', 'x');
        return realSaveAll(items);
      };
      await expect(place()).resolves.toMatchObject({ status: 'PENDING_PAYMENT' });
      expect(calls).toBe(2);
    });

    it('se rinde después de 5 intentos', async () => {
      products.saveAll = async () => {
        throw new ConcurrencyError('Product', 'x');
      };
      await expect(place()).rejects.toThrow(ConcurrencyError);
    });

    it('ignora productos que ya no existen al devolver stock', async () => {
      await expect(stock.release([{ productId: 'nope', quantity: 1 }])).resolves.toBeUndefined();
    });
  });

  describe('AdvanceOrderStatus', () => {
    it('avanza pagar → enviar → entregar y respeta la máquina de estados', async () => {
      await place();
      const advance = new AdvanceOrderStatusUseCase(orders, clock);

      await advance.execute({ id: 'o-1', action: 'pay' });
      await advance.execute({ id: 'o-1', action: 'ship' });
      const view = await advance.execute({ id: 'o-1', action: 'deliver' });

      expect(view.history.map((h) => h.status)).toEqual([
        'PENDING_PAYMENT',
        'PAID',
        'SHIPPED',
        'DELIVERED',
      ]);
      await expect(advance.execute({ id: 'o-1', action: 'pay' })).rejects.toThrow(
        InvalidOrderTransitionError,
      );
      await expect(advance.execute({ id: 'zzz', action: 'pay' })).rejects.toThrow(
        OrderNotFoundError,
      );
    });
  });

  describe('StartCheckout', () => {
    const checkout = (customerId = 'c-1', gateway = payments as never) =>
      new StartCheckoutUseCase(orders, gateway, clock, {
        storeUrl: 'https://tienda.test',
        paymentWindowMinutes: 30,
      }).execute({ id: 'o-1', customerId });

    it('abre la sesión con los precios del pedido y la guarda en el pedido', async () => {
      await place();
      await expect(checkout()).resolves.toEqual({
        url: 'https://checkout.stripe.test/cs_test_1',
      });

      const [request] = payments.requests;
      expect(request).toMatchObject({
        orderId: 'o-1',
        currency: 'USD',
        lines: [{ name: expect.any(String), unitPriceCents: 5999, quantity: 2 }],
        successUrl: 'https://tienda.test/pedidos/o-1?pago=exito',
        cancelUrl: 'https://tienda.test/pedidos/o-1?pago=cancelado',
      });
      // El reloj de prueba avanza un minuto por llamada: place (12:00) y checkout (12:01).
      expect(request!.expiresAt.toISOString()).toBe('2026-11-10T12:31:00.000Z');
      expect((await orders.findById('o-1'))!.paymentSessionId).toBe('cs_test_1');
    });

    it('reutiliza la sesión abierta y crea otra si la anterior expiró', async () => {
      await place();
      await checkout();
      await checkout();
      expect(payments.requests).toHaveLength(1);

      payments.close('cs_test_1');
      await expect(checkout()).resolves.toEqual({
        url: 'https://checkout.stripe.test/cs_test_2',
      });
      expect((await orders.findById('o-1'))!.paymentSessionId).toBe('cs_test_2');
    });

    it('no deja pagar pedidos ajenos, inexistentes ni cancelados', async () => {
      await place();
      await expect(checkout('c-2')).rejects.toThrow(OrderNotFoundError);
      await new CancelOrderUseCase(orders, stock, payments, clock).execute({
        id: 'o-1',
        customerId: 'c-1',
      });
      await expect(checkout()).rejects.toThrow(OrderNotPayableError);
      expect(payments.requests).toHaveLength(0);
    });

    it('sin Stripe configurado responde que los pagos no están disponibles', async () => {
      await place();
      await expect(checkout('c-1', new UnconfiguredPaymentGateway() as never)).rejects.toThrow(
        PaymentsNotConfiguredError,
      );
      const unconfigured = new UnconfiguredPaymentGateway();
      for (const call of [
        () => unconfigured.findOpenCheckout(),
        () => unconfigured.expireCheckout(),
        () => unconfigured.refundCheckout(),
      ]) {
        await expect(call()).rejects.toThrow(PaymentsNotConfiguredError);
      }
    });
  });

  describe('HandlePaymentEvent', () => {
    let processed: InMemoryProcessedEventStore;
    let n: number;
    const handle = (type: PaymentEvent['type'], sessionId = 'cs_test_1', orderId = 'o-1') =>
      new HandlePaymentEventUseCase(orders, stock, payments, processed, clock).execute({
        id: `evt_${++n}`,
        type,
        orderId,
        sessionId,
      });
    const statusOf = async (id = 'o-1') => (await orders.findById(id))!.status;

    /** Un pedido con su sesión de pago abierta, como queda después del paso 19. */
    const placeWithSession = async (sessionId = 'cs_test_1') => {
      await place();
      const order = (await orders.findById('o-1'))!;
      order.attachPaymentSession(sessionId);
      await orders.save(order);
    };

    beforeEach(() => {
      processed = new InMemoryProcessedEventStore();
      n = 0;
    });

    it('un pago confirmado pasa el pedido a PAID', async () => {
      await placeWithSession();
      await expect(handle('payment_succeeded')).resolves.toBe('paid');
      expect(await statusOf()).toBe('PAID');
    });

    it('el mismo aviso dos veces se procesa una sola vez', async () => {
      await placeWithSession();
      const event: PaymentEvent = {
        id: 'evt_repetido',
        type: 'payment_succeeded',
        orderId: 'o-1',
        sessionId: 'cs_test_1',
      };
      const useCase = new HandlePaymentEventUseCase(orders, stock, payments, processed, clock);
      await expect(useCase.execute(event)).resolves.toBe('paid');
      await expect(useCase.execute(event)).resolves.toBe('duplicate');
      expect((await orders.findById('o-1'))!.history).toHaveLength(2);
    });

    it('un segundo pago (otro aviso) para un pedido ya pagado no cambia nada', async () => {
      await placeWithSession();
      await handle('payment_succeeded');
      await expect(handle('payment_succeeded')).resolves.toBe('ignored');
    });

    it('si el pago llega para un pedido cancelado, devuelve el dinero', async () => {
      await placeWithSession();
      await new CancelOrderUseCase(orders, stock, payments, clock).execute({
        id: 'o-1',
        customerId: 'c-1',
      });
      await expect(handle('payment_succeeded')).resolves.toBe('refunded');
      expect([...payments.refunded]).toEqual(['cs_test_1']);
      expect(await statusOf()).toBe('CANCELLED');
    });

    it('ignora avisos de pedidos que no existen', async () => {
      await expect(handle('payment_succeeded', 'cs_x', 'no-existe')).resolves.toBe('ignored');
      await expect(handle('checkout_expired', 'cs_x', 'no-existe')).resolves.toBe('ignored');
    });

    it('si la sesión expira sin pago, cancela el pedido y devuelve el stock', async () => {
      await placeWithSession();
      expect(await stockOf(audifonos!)).toBe(23);
      await expect(handle('checkout_expired')).resolves.toBe('expired');
      expect(await statusOf()).toBe('CANCELLED');
      expect(await stockOf(audifonos!)).toBe(25);
    });

    it('si expira una sesión vieja (el cliente abrió otra), no cancela', async () => {
      await placeWithSession('cs_nueva');
      await expect(handle('checkout_expired', 'cs_vieja')).resolves.toBe('ignored');
      expect(await statusOf()).toBe('PENDING_PAYMENT');
    });

    it('si falla al guardar, no marca el aviso como procesado (la pasarela reintentará)', async () => {
      await placeWithSession();
      const realSave = orders.save.bind(orders);
      orders.save = async () => {
        throw new ConcurrencyError('Order', 'o-1');
      };
      await expect(handle('payment_succeeded')).rejects.toThrow(ConcurrencyError);
      expect(await processed.has('evt_1')).toBe(false);

      orders.save = realSave;
      await expect(handle('payment_succeeded')).resolves.toBe('paid');
    });
  });
});
