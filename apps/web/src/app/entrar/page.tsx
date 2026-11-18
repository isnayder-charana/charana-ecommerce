import type { Metadata } from 'next';
import { AuthCard, OrDivider } from '@/features/auth/auth-card';
import { AUTH_MODE } from '@/features/auth/auth-config';
import { DevSignIn } from '@/features/auth/dev-sign-in';
import { GoogleButton } from '@/features/auth/google-button';
import { safeReturnTo } from '@/features/auth/return-to';
import { SignInForm } from '@/features/auth/sign-in-form';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; confirmada?: string }>;
}) {
  const { volver, confirmada } = await searchParams;
  const returnTo = safeReturnTo(volver);

  return (
    <AuthCard title="Iniciar sesión">
      {AUTH_MODE === 'dev' ? (
        <DevSignIn returnTo={returnTo} />
      ) : (
        <>
          <GoogleButton returnTo={returnTo} />
          <OrDivider />
          <SignInForm
            returnTo={returnTo}
            notice={confirmada ? 'Cuenta confirmada. Ya puedes iniciar sesión.' : undefined}
          />
        </>
      )}
    </AuthCard>
  );
}
