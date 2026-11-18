import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PRODUCT_SEED } from '../src/modules/catalog/infrastructure/persistence/product.seed.js';
import { InternalApiKey } from '../src/shared/infrastructure/auth/internal-api-key.js';
import { adminToken, createTestApp, customerToken } from './support/create-test-app.js';

const KEY = 'clave-interna-de-prueba-'.padEnd(64, 'x');

describe('API interna (e2e): el almacén avanza el pedido', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const fulfill = (id: string, step: string, key: string | null = KEY) => {
    const req = http().post(`/api/internal/orders/${id}/fulfillment`).send({ step });
    return key === null ? req : req.set('X-Internal-Key', key);
  };

  const paidOrder = async () => {
    const placed = await http()
      .post('/api/orders')
      .set(customerToken('c-almacen'))
      .send({ items: [{ productId: PRODUCT_SEED[0]!.id, quantity: 1 }] })
      .expect(201);
    await http()
      .patch(`/api/orders/${placed.body.id}/status`)
      .set(adminToken())
      .send({ action: 'pay' })
      .expect(200);
    return placed.body.id as string;
  };

  beforeAll(async () => {
    app = await createTestApp([], [{ provide: InternalApiKey, useValue: new InternalApiKey(KEY) }]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('envía y entrega con la clave correcta; repetir no cambia nada', async () => {
    const id = await paidOrder();

    await fulfill(id, 'ship').expect(200, { status: 'SHIPPED', changed: true });
    await fulfill(id, 'ship').expect(200, { status: 'SHIPPED', changed: false });
    await fulfill(id, 'deliver').expect(200, { status: 'DELIVERED', changed: true });

    const order = await http().get(`/api/orders/${id}`).set(customerToken('c-almacen'));
    expect(order.body.status).toBe('DELIVERED');
  });

  it('sin clave o con una clave equivocada responde 401 y no toca el pedido', async () => {
    const id = await paidOrder();
    await fulfill(id, 'ship', null).expect(401);
    await fulfill(id, 'ship', 'otra-clave'.padEnd(64, 'y')).expect(401);
    // Un token de cliente tampoco sirve: esta ruta no es para personas.
    await http()
      .post(`/api/internal/orders/${id}/fulfillment`)
      .set(customerToken('c-almacen'))
      .send({ step: 'ship' })
      .expect(401);

    const order = await http().get(`/api/orders/${id}`).set(customerToken('c-almacen'));
    expect(order.body.status).toBe('PAID');
  });

  it('valida el paso (400), el pedido (404) y la máquina de estados (409)', async () => {
    const id = await paidOrder();
    await fulfill(id, 'teletransportar').expect(400);
    await fulfill('00000000-0000-4000-8000-000000000000', 'ship').expect(404);
    await fulfill(id, 'deliver').expect(409);
  });

  it('no aparece en la documentación de Swagger', async () => {
    const docs = await http().get('/api/docs-json').expect(200);
    expect(Object.keys(docs.body.paths).some((p) => p.includes('internal'))).toBe(false);
  });
});

describe('API interna sin clave configurada', () => {
  it('responde 503: nunca queda abierta por olvido', async () => {
    const app = await createTestApp();
    await request(app.getHttpServer())
      .post('/api/internal/orders/00000000-0000-4000-8000-000000000000/fulfillment')
      .set('X-Internal-Key', 'lo-que-sea')
      .send({ step: 'ship' })
      .expect(503);
    await app.close();
  });
});
