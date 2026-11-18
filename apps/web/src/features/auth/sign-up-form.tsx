'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { autoSignIn, confirmSignUp, resendSignUpCode, signUp } from 'aws-amplify/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { TextField } from '@/components/ui/text-field';
import { authErrorMessage } from './auth-errors';
import { useAuth } from './auth-provider';
import { type ConfirmValues, confirmSchema, type SignUpValues, signUpSchema } from './auth-schemas';
import { configureAmplify } from './cognito-auth';

/**
 * Registro en dos pasos: 1) nombre, correo y contraseña; 2) el código de 6
 * números que Cognito envía al correo. Si la persona ya se registró pero no
 * confirmó, llega con `confirmEmail` y empieza directo en el paso 2.
 */
export function SignUpForm({
  returnTo,
  confirmEmail,
}: {
  returnTo: string;
  confirmEmail?: string;
}) {
  const [pendingEmail, setPendingEmail] = useState(confirmEmail);
  // autoSignIn solo funciona si el registro se hizo en esta misma visita.
  const [canAutoSignIn, setCanAutoSignIn] = useState(false);

  if (pendingEmail) {
    return <ConfirmStep email={pendingEmail} returnTo={returnTo} canAutoSignIn={canAutoSignIn} />;
  }
  return (
    <DetailsStep
      returnTo={returnTo}
      onCodeSent={(email) => {
        setCanAutoSignIn(true);
        setPendingEmail(email);
      }}
    />
  );
}

function DetailsStep({
  returnTo,
  onCodeSent,
}: {
  returnTo: string;
  onCodeSent: (email: string) => void;
}) {
  const [error, setError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });

  async function onSubmit({ name, email, password }: SignUpValues) {
    setError(undefined);
    try {
      configureAmplify();
      await signUp({
        username: email,
        password,
        options: { userAttributes: { email, name }, autoSignIn: true },
      });
      onCodeSent(email);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  const signInLink =
    returnTo === '/' ? '/entrar' : `/entrar?volver=${encodeURIComponent(returnTo)}`;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {error && <FormAlert>{error}</FormAlert>}
      <TextField
        label="Nombre"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
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
        autoComplete="new-password"
        hint="Mínimo 8 caracteres, con mayúscula, minúscula y número."
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>
      <p className="text-center text-sm text-muted">
        ¿Ya tienes cuenta?{' '}
        <Link href={signInLink} className="font-semibold text-action hover:underline">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}

function ConfirmStep({
  email,
  returnTo,
  canAutoSignIn,
}: {
  email: string;
  returnTo: string;
  canAutoSignIn: boolean;
}) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmValues>({ resolver: zodResolver(confirmSchema) });

  async function onSubmit({ code }: ConfirmValues) {
    setError(undefined);
    setNotice(undefined);
    try {
      configureAmplify();
      const { nextStep } = await confirmSignUp({ username: email, confirmationCode: code });
      if (canAutoSignIn && nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
        await autoSignIn();
        await refresh();
        router.replace(returnTo);
        return;
      }
      // Sin autoSignIn (por ejemplo, la persona volvió otro día): que entre con su contraseña.
      const params = new URLSearchParams({ confirmada: '1' });
      if (returnTo !== '/') params.set('volver', returnTo);
      router.replace(`/entrar?${params}`);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  async function resend() {
    setError(undefined);
    try {
      configureAmplify();
      await resendSignUpCode({ username: email });
      setNotice('Te enviamos un código nuevo.');
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Te enviamos un código de 6 números a <strong className="text-ink">{email}</strong>. Revisa
        también la carpeta de spam.
      </p>
      {notice && <FormAlert tone="success">{notice}</FormAlert>}
      {error && <FormAlert>{error}</FormAlert>}
      <TextField
        label="Código de verificación"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        error={errors.code?.message}
        {...register('code')}
      />
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Confirmando…' : 'Confirmar cuenta'}
      </Button>
      <Button variant="link" className="self-center" onClick={resend}>
        Enviar otro código
      </Button>
    </form>
  );
}
