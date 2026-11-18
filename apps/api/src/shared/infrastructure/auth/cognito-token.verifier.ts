import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { Jwks } from 'aws-jwt-verify/jwk';
import type { AuthUser } from './auth-user.js';
import type { TokenVerifier } from './token-verifier.js';

export interface CognitoVerifierOptions {
  userPoolId: string;
  clientId: string;
  /** Solo para tests: llaves públicas precargadas para no descargarlas de AWS. */
  jwks?: Jwks;
}

/**
 * ADAPTADOR del puerto TokenVerifier para Amazon Cognito.
 *
 * `aws-jwt-verify` (librería oficial de AWS) hace todo el trabajo pesado:
 * descarga las llaves públicas del user pool (JWKS) y las guarda en caché,
 * verifica la firma RS256, la expiración, el emisor (`iss`), que sea un
 * access token y que `client_id` sea el de nuestra app.
 */
export class CognitoTokenVerifier implements TokenVerifier {
  private readonly verifier;
  private readonly idVerifier;

  constructor({ userPoolId, clientId, jwks }: CognitoVerifierOptions) {
    this.verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'access' });
    this.idVerifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'id' });
    if (jwks) {
      this.verifier.cacheJwks(jwks);
      this.idVerifier.cacheJwks(jwks);
    }
  }

  async verify(token: string): Promise<AuthUser> {
    const payload = await this.verifier.verify(token);
    return {
      id: payload.sub,
      username: payload.username,
      groups: payload['cognito:groups'] ?? [],
    };
  }

  async emailOf(idToken: string, userId: string): Promise<string | null> {
    const payload = await this.idVerifier.verify(idToken);
    // Un ID token válido pero de OTRA persona no sirve: alguien podría pedir a nombre propio
    // y hacer que los correos lleguen a un tercero.
    if (payload.sub !== userId) throw new Error('El ID token no es del mismo usuario');
    return typeof payload.email === 'string' ? payload.email : null;
  }
}
