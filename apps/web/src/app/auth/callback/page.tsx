import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/features/auth/auth-card';
import { OAuthCallback } from '@/features/auth/oauth-callback';

export const metadata: Metadata = { title: 'Iniciando sesión' };

export default function OAuthCallbackPage() {
  return (
    <AuthCard>
      <Suspense>
        <OAuthCallback />
      </Suspense>
    </AuthCard>
  );
}
