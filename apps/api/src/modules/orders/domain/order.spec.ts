import type { OrderLinePrimitives } from './order-line.js';
import {
  InvalidOrderError,
  InvalidOrderTransitionError,
  OrderNotPayableError,
} from './order.errors.js';
import { Order } from './order.js';

const line = (overrides: Partial<OrderLinePrimitives> = {}): OrderLinePrimitives => ({
  productId: 'p-1',
  sku: 'CT-AUD-001',
  name: 'Audífonos',
  unitPriceCents: 5999,
  currency: 'USD',
  quantity: 2,
  ...overrides,
});

const t0 = new Date('2026-11-10T12:00:00Z');
const t1 = new Date('2026-11-10T12:05:00Z');

const place = (
  lines = [
    line(),
    line({ productId: 'p-2', sku: 'CT-CAB-001', unitPriceCents: 1299, quantity: 1 }),
  ],
) => Order.place({ id: 'o-1', customerId: 'c-1', lines, now: t0 });

describe('Order', () => {
  it('nace PENDING_PAYMENT, calcula el total y emite OrderPlaced', () => {
    const order = place();
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.total.cents).toBe(5999 * 2 + 1299);
    expect(order.lines[0]!.subtotal.cents).toBe(11998);
    expect(order.pullEvents().map((e) => e.name)).toEqual(['orders.OrderPlaced']);
  });

  it.each<[string, OrderLinePrimitives[]]>([
    ['sin líneas', []],
    ['producto repetido', [line(), line()]],
    ['cantidad 0', [line({ quantity: 0 })]],
    ['cantidad mayor a 10', [line({ quantity: 11 })]],
    ['más de 20 líneas', Array.from({ length: 21 }, (_, i) => line({ productId: `p-${i}` }))],
  ])('rechaza un pedido %s', (_, lines) => {
    expect(() => place(lines)).toThrow(InvalidOrderError);
  });

  it('no mezcla monedas', () => {
    expect(() => place([line(), line({ productId: 'p-2', currency: 'PEN' })])).toThrow(
      'monedas distintas',
    );
  });

  it('recorre el flujo feliz y guarda el historial', () => {
    const order = place();
    order.pullEvents();
    order.markPaid(t1);
    order.ship(t1);
    order.deliver(t1);

    expect(order.status).toBe('DELIVERED');
    expect(order.history.map((h) => h.status)).toEqual([
      'PENDING_PAYMENT',
      'PAID',
      'SHIPPED',
      'DELIVERED',
    ]);
    expect(order.pullEvents().map((e) => e.name)).toEqual([
      'orders.OrderPaid',
      'orders.OrderShipped',
      'orders.OrderDelivered',
    ]);
  });

  it('se puede cancelar antes de enviarse', () => {
    const pending = place();
    pending.cancel(t1);
    expect(pending.status).toBe('CANCELLED');

    const paid = place();
    paid.markPaid(t1);
    paid.cancel(t1);
    expect(paid.status).toBe('CANCELLED');
  });

  it.each<[string, (o: Order) => void]>([
    ['enviar sin pagar', (o) => o.ship(t1)],
    ['entregar sin enviar', (o) => o.deliver(t1)],
    [
      'pagar dos veces',
      (o) => {
        o.markPaid(t1);
        o.markPaid(t1);
      },
    ],
    [
      'cancelar un pedido enviado',
      (o) => {
        o.markPaid(t1);
        o.ship(t1);
        o.cancel(t1);
      },
    ],
  ])('no permite %s', (_, act) => {
    expect(() => act(place())).toThrow(InvalidOrderTransitionError);
  });

  it('sabe quién es su dueño y se reconstruye desde primitivos', () => {
    const order = place();
    order.markPaid(t1);
    const copy = Order.fromPrimitives(order.toPrimitives());
    expect(copy.isOwnedBy('c-1')).toBe(true);
    expect(copy.isOwnedBy('c-2')).toBe(false);
    expect(copy.toPrimitives()).toEqual(order.toPrimitives());
    expect(copy.createdAt.toISOString()).toBe(t0.toISOString());
  });

  it('recuerda su sesión de pago mientras está pendiente de pago', () => {
    const order = place();
    expect(order.paymentSessionId).toBeNull();
    order.attachPaymentSession('cs_test_1');
    const copy = Order.fromPrimitives(order.toPrimitives());
    expect(copy.paymentSessionId).toBe('cs_test_1');
  });

  it('lee pedidos guardados antes de la fase 3 (sin sesión de pago)', () => {
    const { paymentSessionId, ...old } = place().toPrimitives();
    expect(Order.fromPrimitives(old).paymentSessionId).toBeNull();
  });

  it('no abre un pago para un pedido que ya no está pendiente', () => {
    const order = place();
    order.cancel(t1);
    expect(order.isPayable).toBe(false);
    expect(() => order.attachPaymentSession('cs_test_1')).toThrow(OrderNotPayableError);
  });

  it('guarda el correo del cliente normalizado (opcional para pedidos antiguos)', () => {
    const order = Order.place({
      id: 'o-1',
      customerId: 'c-1',
      customerEmail: '  Ana@Correo.COM ',
      lines: [line()],
      now: t0,
    });
    expect(order.customerEmail).toBe('ana@correo.com');
    expect(Order.fromPrimitives(order.toPrimitives()).customerEmail).toBe('ana@correo.com');

    const { customerEmail, ...old } = place().toPrimitives();
    expect(customerEmail).toBeNull();
    expect(Order.fromPrimitives(old).customerEmail).toBeNull();
  });

  it('rechaza un correo con forma inválida', () => {
    expect(() =>
      Order.place({
        id: 'o-1',
        customerId: 'c-1',
        customerEmail: 'no-es-correo',
        lines: [line()],
        now: t0,
      }),
    ).toThrow(InvalidOrderError);
  });
});
