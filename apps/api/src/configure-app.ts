import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './config/env.js';
import { DomainErrorFilter } from './shared/infrastructure/http/domain-error.filter.js';
import { SchemaValidationPipe } from './shared/infrastructure/http/schema-validation.pipe.js';
import { setupSwagger } from './shared/infrastructure/http/swagger.js';

/**
 * Configuración común a `main.ts` y a los tests e2e, para que los tests
 * prueben la app exactamente como corre en producción.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  // CORS: el navegador solo deja que la tienda (otro origen) lea las respuestas
  // si la API lo autoriza. Solo se permiten los orígenes de CORS_ORIGINS.
  app.enableCors({
    origin: app.get(ConfigService<Env, true>).get('CORS_ORIGINS', { infer: true }),
  });
  app.useGlobalPipes(new SchemaValidationPipe());
  app.useGlobalFilters(new DomainErrorFilter());
  setupSwagger(app);
}
