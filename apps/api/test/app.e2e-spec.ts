import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DomainError } from '../src/shared/domain/index.js';
import { Public } from '../src/shared/infrastructure/auth/auth.decorators.js';
import { createTestApp } from './support/create-test-app.js';

class ProductNotFound extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly kind = 'not_found';
  constructor() {
    super('Producto no encontrado');
  }
}

@Controller('boom')
class BoomController {
  @Get()
  @Public()
  boom(): never {
    throw new ProductNotFound();
  }
}

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp([BoomController]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde ok', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
  });

  it('traduce un DomainError not_found a HTTP 404', async () => {
    await request(app.getHttpServer()).get('/api/boom').expect(404, {
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Producto no encontrado',
    });
  });

  it('permite CORS solo a la tienda configurada', async () => {
    const server = app.getHttpServer();
    await request(server)
      .get('/api/health')
      .set('Origin', 'http://localhost:3001')
      .expect('Access-Control-Allow-Origin', 'http://localhost:3001');

    const other = await request(server).get('/api/health').set('Origin', 'https://otro-sitio.com');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
