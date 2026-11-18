import type { AuthUser } from './auth-user.js';
import type { TokenVerifier } from './token-verifier.js';

const DEV_TOKEN = /^dev:([A-Za-z0-9_-]{1,64})(?::([A-Za-z0-9_,-]+))?$/;

/**
 * ADAPTADOR de DESARROLLO: acepta tokens con el formato
 *   dev:<usuario>              → cliente normal
 *   dev:<usuario>:admin        → usuario del grupo admin
 *
 * Sirve para probar la API en local sin crear un user pool en AWS.
 * `env.ts` impide usarlo cuando NODE_ENV=production.
 */
export class DevTokenVerifier implements TokenVerifier {
  async verify(token: string): Promise<AuthUser> {
    const match = DEV_TOKEN.exec(token);
    const username = match?.[1];
    if (!username) throw new Error('Token de desarrollo inválido');
    const groups = match?.[2];
    return { id: `dev-${username}`, username, groups: groups ? groups.split(',') : [] };
  }

  /** En desarrollo el "ID token" es el mismo token dev; el correo es el que muestra la tienda. */
  async emailOf(idToken: string, userId: string): Promise<string | null> {
    const user = await this.verify(idToken);
    if (user.id !== userId) throw new Error('El ID token no es del mismo usuario');
    return `${user.username}@ejemplo.dev`;
  }
}
