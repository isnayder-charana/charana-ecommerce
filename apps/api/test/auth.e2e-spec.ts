import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { signAccessToken } from './support/cognito-tokens.js';
import { adminToken, bearer, createTestApp, customerToken } from './support/create-test-app.js';

describe('Autenticación y roles (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('las rutas @Public() no piden token', async () => {
    await http().get('/api/health').expect(200);
    await http().get('/api/products').expect(200);
  });

  it('el resto exige token: 401 sin él o con uno inválido', async () => {
    await http().get('/api/orders').expect(401);
    await http().get('/api/orders').set('Authorization', 'Basic abc').expect(401);
    await http()
      .get('/api/orders')
      .set(bearer(signAccessToken({ expiresInSeconds: -1 })))
      .expect(401);
    await http()
      .get('/api/orders')
      .set(bearer(signAccessToken({ signedWithUntrustedKey: true })))
      .expect(401);
  });

  it('con un token válido entra', async () => {
    await http().get('/api/orders').set(customerToken()).expect(200, []);
  });

  it('@AdminOnly(): 403 para un cliente, permitido para un admin', async () => {
    const body = {
      sku: 'CT-FUN-009',
      name: 'Funda X',
      category: 'fundas',
      priceCents: 999,
      stock: 3,
    };
    await http().post('/api/products').set(customerToken()).send(body).expect(403);
    await http().post('/api/products').set(adminToken()).send(body).expect(201);
  });
});
