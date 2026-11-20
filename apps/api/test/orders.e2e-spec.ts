import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { adminToken, createTestApp, customerToken } from './support/create-test-app.js';
import { PRODUCT_SEED } from '../src/modules/catalog/infrastructure/persistence/product.seed.js';

const audifonos = PRODUCT_SEED[0]!;

describe('Orders (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('un cliente no puede cambiar el estado de un pedido (403)', async () => {
    await http()
      .patch('/api/orders/00000000-0000-4000-8000-000000000000/status')
      .set(customerToken())
      .send({ action: 'pay' })
      .expect(403);
  });

  it('flujo completo: comprar, ver, pagar, enviar y entregar', async () => {
    const placed = await http()
      .post('/api/orders')
      .set(customerToken('reclutador-1'))
      .send({ items: [{ productId: audifonos.id, quantity: 2 }] })
      .expect(201);

    expect(placed.body).toMatchObject({
      status: 'PENDING_PAYMENT',
      total: { cents: 11998, currency: 'USD' },
    });
    const id: string = placed.body.id;

    const product = await http().get(`/api/products/${audifonos.id}`).expect(200);
    expect(product.body.stock).toBe(audifonos.stock - 2);

    for (const action of ['pay', 'ship', 'deliver']) {
      await http().patch(`/api/orders/${id}/status`).set(adminToken()).send({ action }).expect(200);
    }

    const order = await http()
      .get(`/api/orders/${id}`)
      .set(customerToken('reclutador-1'))
      .expect(200);
    expect(order.body.status).toBe('DELIVERED');

    const list = await http().get('/api/orders').set(customerToken('reclutador-1')).expect(200);
    expect(list.body.map((o: { id: string }) => o.id)).toContain(id);
  });

  it('otro cliente no puede ver el pedido (404)', async () => {
    const placed = await http()
      .post('/api/orders')
      .set(customerToken('c-a'))
      .send({ items: [{ productId: audifonos.id, quantity: 1 }] })
      .expect(201);

    await http().get(`/api/orders/${placed.body.id}`).set(customerToken('c-b')).expect(404);
    await http().get(`/api/orders/${placed.body.id}/emails`).set(customerToken('c-b')).expect(404);
    // La dueña sí: sin workers (modo memoria) todavía no hay correos.
    const emails = await http()
      .get(`/api/orders/${placed.body.id}/emails`)
      .set(customerToken('c-a'))
      .expect(200);
    expect(emails.body).toEqual([]);
  });

  it('cancelar dos veces el mismo pedido responde 409', async () => {
    const placed = await http()
      .post('/api/orders')
      .set(customerToken('c-x'))
      .send({ items: [{ productId: audifonos.id, quantity: 1 }] })
      .expect(201);
    const id: string = placed.body.id;

    await http().post(`/api/orders/${id}/cancel`).set(customerToken('c-x')).expect(200);
    const res = await http().post(`/api/orders/${id}/cancel`).set(customerToken('c-x')).expect(409);
    expect(res.body.code).toBe('INVALID_ORDER_TRANSITION');
  });

  it('sin stock responde 409 y un body inválido 400', async () => {
    const sinStock = PRODUCT_SEED[4]!;
    const res = await http()
      .post('/api/orders')
      .set(customerToken('c-y'))
      .send({ items: [{ productId: sinStock.id, quantity: 1 }] })
      .expect(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');

    await http().post('/api/orders').set(customerToken('c-y')).send({ items: [] }).expect(400);
  });

  it('Pagar: sin Stripe configurado responde 503 con un código claro', async () => {
    const placed = await http()
      .post('/api/orders')
      .set(customerToken('c-pago'))
      .send({ items: [{ productId: audifonos.id, quantity: 1 }] })
      .expect(201);

    const res = await http()
      .post(`/api/orders/${placed.body.id}/checkout`)
      .set(customerToken('c-pago'))
      .expect(503);
    expect(res.body.code).toBe('PAYMENTS_NOT_CONFIGURED');
  });
});
