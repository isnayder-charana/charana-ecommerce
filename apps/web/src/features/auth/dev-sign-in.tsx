'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from './auth-provider';
import { signInAsTestUser } from './dev-auth';

/** Solo en local (AUTH_MODE=dev): entrar sin AWS con un usuario de prueba. */
export function DevSignIn({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const { refresh } = useAuth();

  async function enter(username: string, admin: boolean) {
    signInAsTestUser(username, admin);
    await refresh();
    router.replace(returnTo);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-control bg-sunken px-3 py-2.5 text-sm text-muted">
        <strong className="text-ink">Modo local.</strong> La API acepta usuarios de prueba, sin AWS.
        Para usar cuentas reales, cambia <code>AUTH_MODE</code> a <code>cognito</code> en los dos{' '}
        <code>.env</code>.
      </p>
      <Button className="w-full" onClick={() => enter('ana', false)}>
        Entrar como usuario de prueba
      </Button>
      <Button variant="secondary" className="w-full" onClick={() => enter('admin', true)}>
        Entrar como admin de prueba
      </Button>
    </div>
  );
}
