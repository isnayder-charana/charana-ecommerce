import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { CognitoTokenVerifier } from '../../src/shared/infrastructure/auth/cognito-token.verifier.js';
import { TOKEN_VERIFIER } from '../../src/shared/infrastructure/auth/token-verifier.js';
import { TEST_CLIENT_ID, TEST_JWKS, TEST_USER_POOL_ID, signAccessToken } from './cognito-tokens.js';

/**
 * Levanta la app completa, pero con el verificador de Cognito apuntando a
 * nuestras llaves de prueba. Es el mismo código que corre en producción.
 */
export async function createTestApp(
  controllers: (new (...args: never[]) => unknown)[] = [],
  overrides: { provide: unknown; useValue: unknown }[] = [],
) {
  let builder = Test.createTestingModule({ imports: [AppModule], controllers });
  for (const { provide, useValue } of overrides) {
    builder = builder.overrideProvider(provide).useValue(useValue);
  }
  const moduleRef = await builder
    .overrideProvider(TOKEN_VERIFIER)
    .useValue(
      new CognitoTokenVerifier({
        userPoolId: TEST_USER_POOL_ID,
        clientId: TEST_CLIENT_ID,
        jwks: TEST_JWKS,
      }),
    )
    .compile();

  // rawBody igual que en main.ts (lo necesita el webhook de Stripe).
  const app: INestApplication = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();
  return app;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
export const customerToken = (sub = 'cliente-1') => bearer(signAccessToken({ sub }));
export const adminToken = () => bearer(signAccessToken({ sub: 'admin-1', groups: ['admin'] }));
