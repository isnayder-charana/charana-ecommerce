import {
  FakeEmailSender,
  FakeOrdersApi,
  memoryLogger,
  orderEvent,
  sqsBody,
  sqsRecord,
} from '../test/support/fixtures.js';
import { buildConsumers } from './consumers.js';
import { fulfillOrder } from './fulfillment/fulfill-order.js';
import { notifyCustomer } from './notifications/notify-customer.js';
import { InMemoryOrderEmailLog } from './shared/order-email-log.js';
import { InMemoryProcessedEventStore } from './shared/processed-events.js';

const storeUrl = 'http://localhost:3001';

describe('Workers', () => {
  let history: InMemoryOrderEmailLog;
  beforeEach(() => {
    history = new InMemoryOrderEmailLog();
  });

  it('notifications envía el correo del evento y lo anota en el log sin el correo completo', async () => {
    const emails = new FakeEmailSender();
    const logger = memoryLogger();
    const notify = notifyCustomer({ emails, history, logger, storeUrl });

    await notify({ ...orderEvent, type: 'OrderShipped', customerEmail: 'ana.maria@correo.com' });

    expect(emails.sent).toHaveLength(1);
    expect(emails.sent[0]).toMatchObject({
      to: 'ana.maria@correo.com',
      subject: 'Tu pedido va en camino · Pedido O-1',
    });
    expect(logger.lines).toEqual([
      'Correo "Tu pedido va en camino · Pedido O-1" enviado a a***@correo.com',
    ]);
    expect(history.records).toEqual([
      {
        orderId: 'o-1',
        eventId: 'e-1',
        occurredAt: orderEvent.occurredAt,
        subject: 'Tu pedido va en camino · Pedido O-1',
        text: expect.stringContaining('Ver tu pedido: http://localhost:3001/pedidos/o-1'),
        delivered: true,
      },
    ]);
  });

  it('notifications no envía nada si el pedido no tiene correo o el evento no se avisa', async () => {
    const emails = new FakeEmailSender();
    const logger = memoryLogger();
    const notify = notifyCustomer({ emails, history, logger, storeUrl });

    await notify(orderEvent); // sin customerEmail
    await notify({ ...orderEvent, type: 'OrderPlaced', customerEmail: 'ana@correo.com' });

    expect(emails.sent).toEqual([]);
    expect(history.records).toEqual([]);
    expect(logger.lines).toEqual(['Pedido o-1 sin correo: no se avisa']);
  });

  it('notifications guarda la copia aunque el correo se omita (sandbox), sin decir "enviado"', async () => {
    const emails = new FakeEmailSender();
    emails.outcome = 'skipped';
    const logger = memoryLogger();

    await notifyCustomer({ emails, history, logger, storeUrl })({
      ...orderEvent,
      customerEmail: 'ana@correo.com',
    });

    expect(logger.lines).toEqual([]);
    expect(history.records).toMatchObject([
      { subject: 'Recibimos tu pago · Pedido O-1', delivered: false },
    ]);
  });

  it('un evento repetido no duplica la copia del correo', async () => {
    const notify = notifyCustomer({
      emails: new FakeEmailSender(),
      history,
      logger: memoryLogger(),
      storeUrl,
    });
    const event = { ...orderEvent, customerEmail: 'ana@correo.com' };

    await notify(event);
    await notify(event);

    expect(history.records).toHaveLength(1);
  });

  it('si SES falla, el error sube para que el mensaje se reintente', async () => {
    const emails = new FakeEmailSender();
    emails.failWith = new Error('SES no responde');
    const notify = notifyCustomer({ emails, history, logger: memoryLogger(), storeUrl });

    await expect(notify({ ...orderEvent, customerEmail: 'ana@correo.com' })).rejects.toThrow(
      'SES no responde',
    );
    expect(history.records).toEqual([]);
  });

  it('fulfillment pide enviar un pedido pagado y entregar uno enviado', async () => {
    const orders = new FakeOrdersApi();
    const logger = memoryLogger();
    const fulfill = fulfillOrder({ orders, logger });

    await fulfill(orderEvent);
    await fulfill({ ...orderEvent, type: 'OrderShipped' });
    await fulfill({ ...orderEvent, type: 'OrderCancelled' });

    expect(orders.calls).toEqual(['o-1:ship', 'o-1:deliver']);
    expect(logger.lines).toEqual(['Pedido o-1 enviado', 'Pedido o-1 entregado']);
  });

  it('fulfillment avisa cuando no había nada que hacer (evento repetido o pedido cancelado)', async () => {
    const orders = new FakeOrdersApi();
    orders.changed = false;
    const logger = memoryLogger();

    await fulfillOrder({ orders, logger })(orderEvent);

    expect(logger.lines).toEqual(['Pedido o-1: nada que hacer (ya está SHIPPED)']);
  });

  it('cada worker lee su cola y anota sus eventos por separado', async () => {
    const processed = new InMemoryProcessedEventStore();
    const emails = new FakeEmailSender();
    const log = console.log;
    console.log = () => undefined;
    try {
      const orders = new FakeOrdersApi();
      const consumers = buildConsumers({
        processed,
        emails,
        emailHistory: history,
        storeUrl,
        orders,
      });
      expect(consumers.map((c) => [c.name, c.queueName])).toEqual([
        ['notifications', 'charanatech-notifications'],
        ['fulfillment', 'charanatech-fulfillment'],
      ]);
      const body = sqsBody({ ...orderEvent, customerEmail: 'ana@correo.com' });
      for (const { handler } of consumers) {
        await handler({ Records: [sqsRecord('m-1', body)] });
      }
    } finally {
      console.log = log;
    }
    expect(await processed.has('notifications', 'e-1')).toBe(true);
    expect(await processed.has('fulfillment', 'e-1')).toBe(true);
    expect(emails.sent.map((e) => e.to)).toEqual(['ana@correo.com']);
  });
});
