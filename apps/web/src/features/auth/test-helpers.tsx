import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { AuthProvider } from './auth-provider';
import type { AuthAdapter, SessionUser } from './session';

export const ana: SessionUser = {
  id: 'user-1',
  email: 'ana@correo.com',
  name: 'Ana María',
  isAdmin: false,
};

/** Adaptador falso: empieza con `user` (o sin sesión) y se puede cambiar en el test. */
export function fakeAdapter(user: SessionUser | null = null) {
  let current = user;
  const listeners = new Set<() => void>();
  const adapter = {
    currentUser: vi.fn(async () => current),
    accessToken: vi.fn(async () => (current ? 'token' : null)),
    idToken: vi.fn(async () => (current ? 'id-token' : null)),
    signOut: vi.fn(async () => {
      current = null;
    }),
    subscribe: vi.fn((onChange: () => void) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    }),
  } satisfies AuthAdapter;
  return {
    adapter,
    setUser(next: SessionUser | null) {
      current = next;
    },
    emit() {
      for (const listener of listeners) listener();
    },
  };
}

/** `wrapper` para render() de Testing Library: se crea una vez por test, a propósito. */
export function withAuth(adapter: AuthAdapter, mode: 'cognito' | 'dev' = 'cognito') {
  // biome-ignore lint/correctness/noComponentHookFactories: Testing Library lo usa una vez por render.
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider adapter={adapter} mode={mode}>
        {children}
      </AuthProvider>
    );
  };
}
