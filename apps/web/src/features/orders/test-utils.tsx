import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/auth-provider';
import type { AuthAdapter } from '@/features/auth/session';

/** QueryClient sin reintentos + sesión falsa, para probar páginas de pedidos. */
export function ordersWrapper(adapter: AuthAdapter) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  // biome-ignore lint/correctness/noComponentHookFactories: Testing Library lo usa una vez por render.
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider adapter={adapter}>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}
