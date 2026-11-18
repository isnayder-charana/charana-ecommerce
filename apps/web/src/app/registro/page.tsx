import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard, OrDivider } from '@/features/auth/auth-card';
import { AUTH_MODE } from '@/features/auth/auth-config';
import { GoogleButton } from '@/features/auth/google-button';
import { safeReturnTo } from '@/features/auth/return-to';
import { SignUpForm } from '@/features/auth/sign-up-form';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; confirmar?: string }>;
}) {
  const { volver, confirmar } = await searchParams;
  const returnTo = safeReturnTo(volver);
  // En modo local no hay registro: se entra con el usuario de prueba.
  if (AUTH_MODE === 'dev') redirect('/entrar');

  return (
    <AuthCard title={confirmar ? 'Confirma tu correo' : 'Crear cuenta'}>
      {!confirmar && (
        <>
          <GoogleButton returnTo={returnTo} />
          <OrDivider />
        </>
      )}
      <SignUpForm returnTo={returnTo} confirmEmail={confirmar} />
    </AuthCard>
  );
}
