/**
 * Cómo inicia sesión la tienda. Debe coincidir con AUTH_MODE de la API:
 * - "cognito": cuentas reales (correo y contraseña, o Google) con Amazon Cognito.
 * - "dev": botones de usuario de prueba, sin AWS (la API acepta tokens "dev:usuario").
 *
 * Next copia las variables NEXT_PUBLIC_* al código del navegador al compilar:
 * aquí solo hay ids públicos, nunca secretos.
 */
export const AUTH_MODE: 'cognito' | 'dev' =
  process.env.NEXT_PUBLIC_AUTH_MODE === 'cognito' ? 'cognito' : 'dev';

export const cognitoConfig = {
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? '',
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '',
  /** Dominio de inicio de sesión (sin https://), sale de `terraform output login_domain`. */
  domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? '',
};

/** Ruta a la que Cognito devuelve después de Google. Debe estar en callback_urls (Terraform). */
export const OAUTH_CALLBACK_PATH = '/auth/callback';
