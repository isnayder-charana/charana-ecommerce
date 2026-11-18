import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { adminToken, createTestApp } from './support/create-test-app.js';

describe('Catalog (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/products lista con paginación por defecto', async () => {
    const res = await http().get('/api/products').expect(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 12, total: 6, totalPages: 1 });
  });

  it('GET /api/products valida la query', async () => {
    const res = await http().get('/api/products?category=juguetes&page=0').expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual([
      'category',
      'page',
    ]);
  });

  it('GET /api/products/:id devuelve 404 si no existe', async () => {
    const res = await http().get('/api/products/00000000-0000-4000-8000-000000000000').expect(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('POST /api/products crea un producto y luego se puede leer', async () => {
    const created = await http()
      .post('/api/products')
      .set(adminToken())
      .send({
        sku: 'CT-FUN-002',
        name: 'Funda iPad',
        category: 'fundas',
        priceCents: 2999,
        stock: 10,
      })
      .expect(201);

    const res = await http().get(`/api/products/${created.body.id}`).expect(200);
    expect(res.body).toMatchObject({ sku: 'CT-FUN-002', price: { cents: 2999, currency: 'USD' } });
  });

  it('POST /api/products responde 409 con un SKU repetido', async () => {
    const res = await http()
      .post('/api/products')
      .set(adminToken())
      .send({ sku: 'CT-AUD-001', name: 'Copia', category: 'audio', priceCents: 100, stock: 1 })
      .expect(409);
    expect(res.body.code).toBe('SKU_ALREADY_EXISTS');
  });
});
