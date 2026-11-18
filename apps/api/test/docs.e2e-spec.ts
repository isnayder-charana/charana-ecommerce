import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './support/create-test-app.js';

describe('Documentación OpenAPI (e2e)', () => {
  let app: INestApplication;
  let doc: {
    security: unknown;
    paths: Record<
      string,
      Record<string, { security?: unknown; requestBody?: unknown; parameters?: { name: string }[] }>
    >;
  };

  beforeAll(async () => {
    app = await createTestApp();
    doc = (await request(app.getHttpServer()).get('/api/docs-json').expect(200)).body;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sirve Swagger UI en /api/docs sin token', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs').expect(200);
    expect(res.text).toContain('OrderHub API');
  });

  it('exige token por defecto y lo quita solo en las rutas públicas', () => {
    expect(doc.security).toEqual([{ bearer: [] }]);
    expect(doc.paths['/api/products']?.get?.security).toEqual([{}]);
    expect(doc.paths['/api/orders']?.post?.security).toBeUndefined();
  });

  it('documenta el body y los parámetros a partir de los esquemas Zod', () => {
    expect(JSON.stringify(doc.paths['/api/orders']?.post?.requestBody)).toContain('productId');
    const query = doc.paths['/api/products']?.get?.parameters?.map((p) => p.name);
    expect(query).toEqual(expect.arrayContaining(['q', 'category', 'page', 'pageSize']));
  });
});
