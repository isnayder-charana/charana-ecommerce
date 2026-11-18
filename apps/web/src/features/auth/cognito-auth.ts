import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
// Necesario en Next.js: termina el viaje a Google cuando la persona vuelve a /auth/callback.
import 'aws-amplify/auth/enable-oauth-listener';
import { cognitoConfig, OAUTH_CALLBACK_PATH } from './auth-config';
import type { AuthAdapter, SessionUser } from './session';

let configured = false;

/**
 * Configura Amplify una sola vez, en el navegador. Los tokens quedan en
 * localStorage y Amplify los renueva solo con el refresh token (30 días).
 */
export function configureAmplify(): void {
  if (configured || typeof window === 'undefined') return;
  const origin = window.location.origin;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: cognitoConfig.userPoolId,
        userPoolClientId: cognitoConfig.clientId,
        loginWith: {
          email: true,
          oauth: {
            domain: cognitoConfig.domain,
            scopes: ['openid', 'email', 'profile'],
            // Deben coincidir EXACTAMENTE con callback_urls y logout_urls de Terraform.
            redirectSignIn: [`${origin}${OAUTH_CALLBACK_PATH}`],
            redirectSignOut: [origin],
            responseType: 'code', // código + PKCE, nunca tokens en la URL
          },
        },
      },
    },
  });
  configured = true;
}

// Eventos de Amplify que cambian la sesión.
const SESSION_EVENTS = new Set([
  'signedIn',
  'signedOut',
  'signInWithRedirect',
  'tokenRefresh_failure',
]);

/** ADAPTADOR de AuthAdapter para Amazon Cognito (con Amplify). */
export const cognitoAuth: AuthAdapter = {
  async currentUser(): Promise<SessionUser | null> {
    configureAmplify();
    const { tokens } = await fetchAuthSession();
    if (!tokens?.accessToken) return null;

    // El ID token trae los datos de la persona; el access token, sus grupos.
    const profile = tokens.idToken?.payload ?? {};
    const groups = tokens.accessToken.payload['cognito:groups'];
    const email = typeof profile.email === 'string' ? profile.email : '';
    return {
      id: String(tokens.accessToken.payload.sub),
      email,
      name: typeof profile.name === 'string' && profile.name ? profile.name : email,
      isAdmin: Array.isArray(groups) && groups.includes('admin'),
    };
  },

  async accessToken() {
    configureAmplify();
    const { tokens } = await fetchAuthSession();
    return tokens?.accessToken.toString() ?? null;
  },

  async idToken() {
    configureAmplify();
    const { tokens } = await fetchAuthSession();
    return tokens?.idToken?.toString() ?? null;
  },

  async signOut() {
    configureAmplify();
    await signOut();
  },

  subscribe(onChange) {
    configureAmplify();
    return Hub.listen('auth', ({ payload }) => {
      if (SESSION_EVENTS.has(payload.event)) onChange();
    });
  },
};
