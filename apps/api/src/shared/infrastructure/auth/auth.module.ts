import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import type { Env } from '../../../config/env.js';
import { AdminGuard } from './admin.guard.js';
import { CognitoTokenVerifier } from './cognito-token.verifier.js';
import { DevTokenVerifier } from './dev-token.verifier.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { TOKEN_VERIFIER, type TokenVerifier } from './token-verifier.js';

/**
 * Elige el adaptador según AUTH_MODE y registra los dos guards como
 * globales (APP_GUARD). El orden importa: primero autenticación, luego rol.
 * Es global y exporta el verificador: Orders lo usa para leer el correo del ID token.
 */
@Global()
@Module({
  providers: [
    {
      provide: TOKEN_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): TokenVerifier => {
        if (config.get('AUTH_MODE', { infer: true }) === 'dev') return new DevTokenVerifier();
        // env.ts ya garantiza que existen en modo cognito; el `?? ''` solo satisface a TypeScript.
        return new CognitoTokenVerifier({
          userPoolId: config.get('COGNITO_USER_POOL_ID', { infer: true }) ?? '',
          clientId: config.get('COGNITO_CLIENT_ID', { infer: true }) ?? '',
        });
      },
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    {
      provide: APP_GUARD,
      inject: [Reflector, ConfigService],
      useFactory: (reflector: Reflector, config: ConfigService<Env, true>) =>
        new AdminGuard(reflector, config.get('COGNITO_ADMIN_GROUP', { infer: true })),
    },
  ],
  exports: [TOKEN_VERIFIER],
})
export class AuthModule {}
