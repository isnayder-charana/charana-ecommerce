import {
  TEST_CLIENT_ID,
  TEST_JWKS,
  TEST_USER_POOL_ID,
  signAccessToken,
  signIdToken,
} from '../../../../test/support/cognito-tokens.js';
import { CognitoTokenVerifier } from './cognito-token.verifier.js';

describe('CognitoTokenVerifier', () => {
  const verifier = new CognitoTokenVerifier({
    userPoolId: TEST_USER_POOL_ID,
    clientId: TEST_CLIENT_ID,
    jwks: TEST_JWKS,
  });

  it('traduce un access token válido a un AuthUser', async () => {
    const token = signAccessToken({ sub: 'u-1', username: 'ana', groups: ['admin'] });
    await expect(verifier.verify(token)).resolves.toEqual({
      id: 'u-1',
      username: 'ana',
      groups: ['admin'],
    });
  });

  it('un usuario sin grupos tiene groups vacío', async () => {
    const user = await verifier.verify(signAccessToken());
    expect(user.groups).toEqual([]);
  });

  it.each([
    ['vencido', { expiresInSeconds: -60 }],
    ['de otra app (client_id)', { clientId: 'otra-app' }],
    ['de tipo id token', { tokenUse: 'id' as const }],
    ['firmado con otra llave', { signedWithUntrustedKey: true }],
  ])('rechaza un token %s', async (_, options) => {
    await expect(verifier.verify(signAccessToken(options))).rejects.toThrow();
  });

  it('rechaza algo que no es un JWT', async () => {
    await expect(verifier.verify('no-soy-un-token')).rejects.toThrow();
  });

  describe('correo desde el ID token', () => {
    it('devuelve el correo si el ID token es de la misma persona', async () => {
      const idToken = signIdToken({ sub: 'u-1', email: 'ana@correo.com' });
      await expect(verifier.emailOf(idToken, 'u-1')).resolves.toBe('ana@correo.com');
      await expect(verifier.emailOf(signIdToken({ sub: 'u-1' }), 'u-1')).resolves.toBeNull();
    });

    it('rechaza el ID token de otra persona, de otra app, mal firmado o un access token', async () => {
      await expect(
        verifier.emailOf(signIdToken({ sub: 'u-2', email: 'x@y.com' }), 'u-1'),
      ).rejects.toThrow('mismo usuario');
      await expect(
        verifier.emailOf(signIdToken({ clientId: 'otra-app' }), 'user-123'),
      ).rejects.toThrow();
      await expect(
        verifier.emailOf(signIdToken({ signedWithUntrustedKey: true }), 'user-123'),
      ).rejects.toThrow();
      await expect(verifier.emailOf(signAccessToken(), 'user-123')).rejects.toThrow();
    });
  });
});
