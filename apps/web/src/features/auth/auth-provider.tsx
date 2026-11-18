'use client';

import { createContext, type ReactNode, use, useCallback, useEffect, useState } from 'react';
import { AUTH_MODE } from './auth-config';
import { cognitoAuth } from './cognito-auth';
import { devAuth } from './dev-auth';
import type { AuthAdapter, SessionUser } from './session';

export type AuthState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser };

interface AuthContextValue {
  state: AuthState;
  mode: 'cognito' | 'dev';
  /** Token para la cabecera Authorization de la API (null sin sesión). */
  getAccessToken: () => Promise<string | null>;
  /** ID token (con el correo); solo para crear pedidos. */
  getIdToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Vuelve a leer la sesión (por ejemplo, justo después de iniciar sesión). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const defaultAdapter = AUTH_MODE === 'cognito' ? cognitoAuth : devAuth;

export function AuthProvider({
  children,
  adapter = defaultAdapter,
  mode = AUTH_MODE,
}: {
  children: ReactNode;
  /** Solo para tests: otro adaptador. */
  adapter?: AuthAdapter;
  mode?: 'cognito' | 'dev';
}) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const user = await adapter.currentUser();
      setState(user ? { status: 'signedIn', user } : { status: 'signedOut' });
    } catch {
      // Sesión dañada o vencida: se trata como "sin sesión".
      setState({ status: 'signedOut' });
    }
  }, [adapter]);

  useEffect(() => {
    void refresh();
    return adapter.subscribe(() => void refresh());
  }, [adapter, refresh]);

  const signOut = useCallback(async () => {
    await adapter.signOut();
    await refresh();
  }, [adapter, refresh]);

  const value: AuthContextValue = {
    state,
    mode,
    getAccessToken: () => adapter.accessToken(),
    getIdToken: () => adapter.idToken(),
    signOut,
    refresh,
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return value;
}
