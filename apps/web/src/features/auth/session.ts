/** La persona con sesión iniciada, tal como la usa la tienda. */
export interface SessionUser {
  id: string;
  email: string;
  /** Nombre para mostrar; si no hay, se usa el correo. */
  name: string;
  isAdmin: boolean;
}

/**
 * PUERTO de autenticación (la misma idea que TokenVerifier en la API).
 * La tienda solo conoce esta interfaz; hay dos adaptadores:
 * Cognito (cuentas reales) y dev (usuario de prueba en local).
 */
export interface AuthAdapter {
  /** Usuario actual, o null si no hay sesión. */
  currentUser(): Promise<SessionUser | null>;
  /** Access token para la cabecera Authorization de la API, o null sin sesión. */
  accessToken(): Promise<string | null>;
  /**
   * ID token (trae el correo, firmado por Cognito), o null sin sesión. Solo se
   * envía al crear un pedido, para que la API sepa a qué correo avisar.
   */
  idToken(): Promise<string | null>;
  signOut(): Promise<void>;
  /** Avisa cuando la sesión cambia (entrar, salir, sesión vencida). Devuelve cómo dejar de escuchar. */
  subscribe(onChange: () => void): () => void;
}

/** Primer nombre para saludar: "Ana María" → "Ana"; "ana@correo.com" → "ana". */
export function firstName(user: Pick<SessionUser, 'name'>): string {
  const [first = ''] = user.name.split(/[\s@]/);
  return first || user.name;
}
