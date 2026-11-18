'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'aws-amplify/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { TextField } from '@/components/ui/text-field';
import { authErrorMessage, authErrorName } from './auth-errors';
import { useAuth } from './auth-provider';
import { type SignInValues, signInSchema } from './auth-schemas';
import { configureAmplify } from './cognito-auth';

/** Inicio de sesión con correo y contraseña (Cognito, protocolo SRP). */
export function SignInForm({ returnTo, notice }: { returnTo: string; notice?: string }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [error, setError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });

  function goToConfirm(email: string) {
    const params = new URLSearchParams({ confirmar: email });
    if (returnTo !== '/') params.set('volver', returnTo);
    router.push(`/registro?${params}`);
  }

  async function onSubmit({ email, password }: SignInValues) {
    setError(undefined);
    try {
      configureAmplify();
      const { nextStep } = await signIn({ username: email, password });
      if (nextStep.signInStep === 'CONFIRM_SIGN_UP') return goToConfirm(email);
      if (nextStep.signInStep !== 'DONE') {
        setError('Tu cuenta necesita un paso extra que la tienda todavía no admite.');
        return;
      }
      await refresh();
      router.replace(returnTo);
    } catch (err) {
      const name = authErrorName(err);
      if (name === 'UserNotConfirmedException') return goToConfirm(email);
      if (name === 'UserAlreadyAuthenticatedException') {
        await refresh();
        router.replace(returnTo);
        return;
      }
      setError(authErrorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {notice && <FormAlert tone="success">{notice}</FormAlert>}
      {error && <FormAlert>{error}</FormAlert>}
      <TextField
        label="Correo"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Entrando…' : 'Entrar'}
      </Button>
      <p className="text-center text-sm text-muted">
        ¿No tienes cuenta?{' '}
        <Link
          href={returnTo === '/' ? '/registro' : `/registro?volver=${encodeURIComponent(returnTo)}`}
          className="font-semibold text-action hover:underline"
        >
          Crear cuenta
        </Link>
      </p>
    </form>
  );
}
