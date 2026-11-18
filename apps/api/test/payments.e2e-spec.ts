import type { INestApplication } from '@nestjs/common';
import Stripe from 'stripe';
import request from 'supertest';
import {
  EVENT_PUBLISHER,
  type EventPublisher,
  type OrderEvent,
} from '../src/modules/orders/application/order-events.js';
import { PAYMENT_GATEWAY } from '../src/modules/orders/application/payment.gateway.js';
import { FakePaymentGateway } from '../src/modules/orders/infrastructure/payments/fake-payment.gateway.js';
import { OutboxRelayService } from '../src/modules/orders/infrastructure/events/outbox-relay.service.js';
import { StripeWebhookParser } from '../src/modules/orders/infrastructure/payments/stripe-webhook.parser.js';
import { PRODUCT_SEED } from '../src/modules/catalog/infrastructure/persistence/product.seed.js';
import { signIdToken } from './support/cognito-tokens.js';
import { createTestApp, customerToken } from './support/create-test-app.js';

const secret = 'whsec_e2e123';
const audifonos = PRODUCT_SEED[0]!;
let n = 0;

/** Un aviso de Stripe firmado con el secreto, como el que manda `stripe listen`. */
function stripeEvent(type: string, orderId: string, sessionId: string, id = `evt_${++n}`) {
  const payload = JSON.stringify({
    id,
    object: 'event',
    type,
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: type === 'checkout.session.completed' ? 'paid' : 'unpaid',
        metadata: { orderId },
      },
    },
  });
  return { payload, signature: Stripe.webhooks.generateTestHeaderString({ payload, secret }) };
}

describe('Pagos (e2e): checkout + webhook de Stripe', () => {
  let app: INestApplication;
  const payments = new FakePaymentGateway();
  const published: OrderEvent[] = [];
  const bus: EventPublisher = {
    publish: async (events) => {
      published.push(...events);
    },
  };
  const http = () => request(app.getHttpServer());

  const placeAndCheckout = async (customer: string) => {
    const placed = await http()
      .post('/api/orders')
      .set(customerToken(customer))
      .send({ items: [{ productId: audifonos.id, quantity: 1 }] })
      .expect(201);
    const id: string = placed.body.id;
    await http().post(`/api/orders/${id}/checkout`).set(customerToken(customer)).expect(200);
    return { id, sessionId: `cs_test_${payments.requests.length}` };
  };

  const sendWebhook = ({ payload, signature }: { payload: string; signature: string }) =>
    http()
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(payload);

  const statusOf = async (id: string, customer: string) =>
    (await http().get(`/api/orders/${id}`).set(customerToken(customer)).expect(200)).body.status;

  beforeAll(async () => {
    app = await createTestApp(
      [],
      [
        { provide: PAYMENT_GATEWAY, useValue: payments },
        { provide: StripeWebhookParser, useValue: new StripeWebhookParser(secret) },
        { provide: EVENT_PUBLISHER, useValue: bus },
      ],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('el aviso de pago marca el pedido PAID, sin token y aunque llegue dos veces', async () => {
    const { id, sessionId } = await placeAndCheckout('c-pagador');
    const event = stripeEvent('checkout.session.completed', id, sessionId, 'evt_repetido');

    await sendWebhook(event).expect(200, { received: true });
    expect(await statusOf(id, 'c-pagador')).toBe('PAID');

    await sendWebhook(event).expect(200);
    const order = await http().get(`/api/orders/${id}`).set(customerToken('c-pagador'));
    expect(order.body.history.map((h: { status: string }) => h.status)).toEqual([
      'PENDING_PAYMENT',
      'PAID',
    ]);
  });

  it('rechaza avisos con firma inválida (400) y no toca el pedido', async () => {
    const { id, sessionId } = await placeAndCheckout('c-atacante');
    const { payload } = stripeEvent('checkout.session.completed', id, sessionId);

    const res = await sendWebhook({ payload, signature: 't=1,v1=falsa' }).expect(400);
    expect(res.body.code).toBe('INVALID_PAYMENT_EVENT');
    expect(await statusOf(id, 'c-atacante')).toBe('PENDING_PAYMENT');
  });

  it('si la sesión expira, cancela el pedido y devuelve el stock', async () => {
    const before = (await http().get(`/api/products/${audifonos.id}`)).body.stock;
    const { id, sessionId } = await placeAndCheckout('c-lento');

    await sendWebhook(stripeEvent('checkout.session.expired', id, sessionId)).expect(200);

    expect(await statusOf(id, 'c-lento')).toBe('CANCELLED');
    expect((await http().get(`/api/products/${audifonos.id}`)).body.stock).toBe(before);
  });

  it('cancelar un pedido pagado devuelve el dinero', async () => {
    const { id, sessionId } = await placeAndCheckout('c-arrepentido');
    await sendWebhook(stripeEvent('checkout.session.completed', id, sessionId)).expect(200);

    await http().post(`/api/orders/${id}/cancel`).set(customerToken('c-arrepentido')).expect(200);
    expect(payments.refunded.has(sessionId)).toBe(true);
  });

  it('el relé del outbox publica OrderPlaced y OrderPaid del pedido pagado', async () => {
    const { id, sessionId } = await placeAndCheckout('c-eventos');
    await sendWebhook(stripeEvent('checkout.session.completed', id, sessionId)).expect(200);

    await app.get(OutboxRelayService).tick();

    const mine = published.filter((e) => e.orderId === id);
    expect(mine.map((e) => e.type)).toEqual(['OrderPlaced', 'OrderPaid']);
    expect(mine[1]).toMatchObject({ customerId: 'c-eventos', status: 'PAID' });
    expect(mine[1]).not.toHaveProperty('customerEmail'); // sin ID token no hay correo

    // Ya publicados: la siguiente vuelta no los repite.
    const before = published.length;
    await app.get(OutboxRelayService).tick();
    expect(published.length).toBe(before);
  });

  describe('correo del cliente (paso 24)', () => {
    const order = { items: [{ productId: audifonos.id, quantity: 1 }] };

    it('con el ID token de la misma persona, el correo viaja en los eventos', async () => {
      const placed = await http()
        .post('/api/orders')
        .set(customerToken('c-correo'))
        .set('X-Id-Token', signIdToken({ sub: 'c-correo', email: 'Ana@Correo.com' }))
        .send(order)
        .expect(201);
      expect(placed.body).not.toHaveProperty('customerEmail'); // no se expone en la respuesta

      await app.get(OutboxRelayService).tick();
      const event = published.find((e) => e.orderId === placed.body.id);
      expect(event).toMatchObject({ type: 'OrderPlaced', customerEmail: 'ana@correo.com' });
    });

    it('rechaza (401) un ID token de otra persona o inválido, sin crear el pedido', async () => {
      for (const idToken of [signIdToken({ sub: 'otra-persona', email: 'x@y.com' }), 'basura']) {
        await http()
          .post('/api/orders')
          .set(customerToken('c-tramposo'))
          .set('X-Id-Token', idToken)
          .send(order)
          .expect(401);
      }
      const mine = await http().get('/api/orders').set(customerToken('c-tramposo')).expect(200);
      expect(mine.body).toEqual([]);
    });
  });
});
