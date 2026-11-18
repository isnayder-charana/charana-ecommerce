import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const DOCS_PATH = 'api/docs';

/**
 * Documentación interactiva en /api/docs (y el JSON OpenAPI en /api/docs-json).
 * Los esquemas de entrada salen de los mismos esquemas Zod que validan las
 * peticiones, así la documentación nunca se desactualiza.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('OrderHub API')
    .setDescription(
      [
        'Backend de pedidos de CharanaTech (NestJS, arquitectura hexagonal + DDD).',
        '',
        '**Cómo autenticarte:** pulsa **Authorize** y pega un token.',
        '- En local (`AUTH_MODE=dev`): `dev:ana` para un cliente o `dev:ana:admin` para un administrador.',
        '- Con Cognito: el *access token* que entrega Cognito al iniciar sesión.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      description: 'dev:ana, dev:ana:admin o un JWT de Cognito',
    })
    // Seguro por defecto también en la documentación: toda ruta pide token salvo las @Public().
    .addSecurityRequirements('bearer')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(DOCS_PATH, app, document, {
    customSiteTitle: 'OrderHub API',
    swaggerOptions: { persistAuthorization: true }, // recuerda el token al recargar la página
  });
}
