import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../../../config/env.js';
import { AuthModule } from './auth.module.js';
import { CognitoTokenVerifier } from './cognito-token.verifier.js';
import { DevTokenVerifier } from './dev-token.verifier.js';
import { TOKEN_VERIFIER } from './token-verifier.js';

/** Comprueba que AUTH_MODE elige el adaptador correcto. */
async function verifierFor(env: Record<string, string>) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validate: () => validateEnv(env),
      }),
      AuthModule,
    ],
  }).compile();
  return moduleRef.get(TOKEN_VERIFIER);
}

describe('AuthModule', () => {
  it('usa DevTokenVerifier en modo dev', async () => {
    expect(await verifierFor({ AUTH_MODE: 'dev' })).toBeInstanceOf(DevTokenVerifier);
  });

  it('usa CognitoTokenVerifier en modo cognito', async () => {
    const verifier = await verifierFor({
      AUTH_MODE: 'cognito',
      COGNITO_USER_POOL_ID: 'us-east-1_AbC123',
      COGNITO_CLIENT_ID: 'abc',
    });
    expect(verifier).toBeInstanceOf(CognitoTokenVerifier);
  });
});
