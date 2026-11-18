'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-provider';
import { signInHref } from '@/features/auth/return-to';
import { placeOrderFromCart } from './checkout.actions';

/**
 * "Continuar compra" en el carrito. Sin sesión, primero lleva a iniciar sesión
 * y luego vuelve aquí. Con sesión, crea el pedido y abre su página.
 */
export function CheckoutButton({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { state, getAccessToken, getIdToken } = useAuth();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const goToSignIn = () => router.push(signInHref('/carrito'));

  function handleClick() {
    setError(undefined);
    startTransition(async () => {
      const token = await getAccessToken().catch(() => null);
      if (!token) return goToSignIn();

      // El ID token lleva el correo para los avisos del pedido. Si falla, se compra igual, sin avisos.
      const idToken = await getIdToken().catch(() => null);
      const result = await placeOrderFromCart(token, idToken);
      if (result.ok) {
        // "Mis pedidos" ya tiene uno nuevo: lo que haya en caché quedó viejo.
        await queryClient.invalidateQueries({ queryKey: ['orders'] });
        router.push(`/pedidos/${result.orderId}?nuevo=1`);
        return;
      }
      if (result.reason === 'signin') return goToSignIn();
      setError(result.message);
      router.refresh(); // vuelve a pedir stock y precios para marcar el problema
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={disabled || pending || state.status === 'loading'}>
        {pending
          ? 'Creando pedido…'
          : state.status === 'signedOut'
            ? 'Inicia sesión para comprar'
            : 'Continuar compra'}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
