import type { Request } from 'express';

/** El usuario autenticado, ya traducido desde el token. */
export interface AuthUser {
  /** `sub` del token: id único e inmutable del usuario en Cognito. */
  id: string;
  username: string;
  groups: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
