import type { AuthUser } from './auth-user.js';

/**
 * PUERTO: "dame un token y te digo quién es". El guard no sabe si detrás
 * hay Cognito o un verificador de desarrollo.
 * Debe lanzar un error si el token es inválido, está vencido o mal firmado.
 */
export interface TokenVerifier {
  verify(token: string): Promise<AuthUser>;
  /**
   * Lee el correo de un ID token de la MISMA persona (`userId` = su `sub`).
   * El access token no trae el correo; el ID token sí, firmado por Cognito.
   * Lanza error si el token es inválido o es de otra persona.
   */
  emailOf(idToken: string, userId: string): Promise<string | null>;
}

export const TOKEN_VERIFIER = Symbol('TokenVerifier');
