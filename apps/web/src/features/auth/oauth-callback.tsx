'use client';

import { Hub } from 'aws-amplify/utils';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { configureAmplify } from './cognito-auth';
import { takeReturnTo } from './return-to';

/**
 * Regreso de Google: la URL trae ?code=… y Amplify lo cambia por los tokens
 * (con el verificador PKCE que guardó antes de salir). Aquí solo esperamos el
 * resultado y llevamos a la persona a donde estaba.
 */
export function OAuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const { state } = useAuth();
  // Si la persona canceló en Google, Cognito vuelve con ?error=…
  const [failed, setFailed] = useState(params.has('error'));

  useEffect(() => {
    configureAmplify();
    return Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect_failure') setFailed(true);
    });
  }, []);

  useEffect(() => {
    if (state.status === 'signedIn') router.replace(takeReturnTo());
  }, [state.status, router]);

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-xl font-bold">No se pudo iniciar sesión con Google</h1>
        <p className="max-w-sm text-muted">
          Puede que hayas cancelado o que el enlace haya vencido.
        </p>
        <Link href="/entrar" className="text-sm font-semibold text-action hover:underline">
          Volver a intentarlo
        </Link>
      </div>
    );
  }

  return (
    <p role="status" className="text-center text-muted">
      Iniciando sesión…
    </p>
  );
}
