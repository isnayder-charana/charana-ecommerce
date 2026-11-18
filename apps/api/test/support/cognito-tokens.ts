import { generateKeyPairSync, sign } from 'node:crypto';
import type { Jwks } from 'aws-jwt-verify/jwk';

/**
 * Simula un user pool de Cognito en los tests: generamos un par de llaves
 * RSA, publicamos la pública como JWKS y firmamos tokens con la privada.
 * Así probamos la verificación REAL sin conectarnos a AWS.
 */
export const TEST_USER_POOL_ID = 'us-east-1_TestPool1';
export const TEST_CLIENT_ID = 'test-client-id';
const ISSUER = `https://cognito-idp.us-east-1.amazonaws.com/${TEST_USER_POOL_ID}`;
const KID = 'test-key-1';

function createKey() {
  return generateKeyPairSync('rsa', { modulusLength: 2048 });
}

const trusted = createKey();
const untrusted = createKey();

const { n, e } = trusted.publicKey.export({ format: 'jwk' });

export const TEST_JWKS: Jwks = {
  keys: [{ kty: 'RSA', n: n!, e: e!, kid: KID, alg: 'RS256', use: 'sig' }],
};

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

export interface TokenOptions {
  sub?: string;
  username?: string;
  groups?: string[];
  expiresInSeconds?: number;
  clientId?: string;
  tokenUse?: 'access' | 'id';
  signedWithUntrustedKey?: boolean;
}

export function signAccessToken(options: TokenOptions = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: KID, typ: 'JWT' };
  const payload = {
    sub: options.sub ?? 'user-123',
    username: options.username ?? 'reclutador',
    'cognito:groups': options.groups,
    iss: ISSUER,
    client_id: options.clientId ?? TEST_CLIENT_ID,
    token_use: options.tokenUse ?? 'access',
    scope: 'aws.cognito.signin.user.admin',
    iat: now,
    exp: now + (options.expiresInSeconds ?? 3600),
  };
  const data = `${b64url(header)}.${b64url(payload)}`;
  const key = options.signedWithUntrustedKey ? untrusted.privateKey : trusted.privateKey;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`;
}

/** ID token: trae los datos de la persona (correo) y su app va en `aud`, no en `client_id`. */
export function signIdToken(
  options: {
    sub?: string;
    email?: string;
    clientId?: string;
    signedWithUntrustedKey?: boolean;
  } = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: KID, typ: 'JWT' };
  const payload = {
    sub: options.sub ?? 'user-123',
    email: options.email,
    email_verified: true,
    iss: ISSUER,
    aud: options.clientId ?? TEST_CLIENT_ID,
    token_use: 'id',
    auth_time: now,
    iat: now,
    exp: now + 3600,
  };
  const data = `${b64url(header)}.${b64url(payload)}`;
  const key = options.signedWithUntrustedKey ? untrusted.privateKey : trusted.privateKey;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`;
}
