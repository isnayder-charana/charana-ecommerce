'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { AuthProvider } from '@/features/auth/auth-provider';

export function Providers({ children }: { children: ReactNode }) {
  // useState garantiza UN QueryClient por pestaña (no uno nuevo en cada render).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // El catálogo cambia poco: durante 1 minuto se usa la caché sin volver a pedir.
            staleTime: 60_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
