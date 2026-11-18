'use client';

import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { useAuth } from '@/features/auth/auth-provider';
import { ApiError } from '@/lib/api-client';
import { goTo } from '@/lib/navigation';
import { startCheckout } from './orders.queries';

const ERRORS: Record<string, string> = {
  ORDER_NOT_PAYABLE: 'Este pedido ya no se puede pagar.',
  PAYMENTS_NOT_CONFIGURED: 'Los pagos no están disponibles en este momento.',
};

/** Abre la página de pago de Stripe. El navegador sale de la tienda y vuelve al terminar. */
export function PayButton({ orderId }: { orderId: string }) {
  const { getAccessToken } = useAuth();
  const pay = useMutation({
    mutationFn: () => startCheckout(orderId, getAccessToken),
    onSuccess: ({ url }) => goTo(url),
  });
  // Tras el éxito el botón sigue ocupado mientras el navegador cambia de página.
  const busy = pay.isPending || pay.isSuccess;

  return (
    <>
      <Button onClick={() => pay.mutate()} disabled={busy}>
        {busy ? 'Abriendo Stripe…' : 'Pagar con Stripe'}
      </Button>
      {pay.isError && (
        <FormAlert>
          {(pay.error instanceof ApiError && ERRORS[pay.error.code]) ||
            'No pudimos abrir la página de pago. Inténtalo otra vez.'}
        </FormAlert>
      )}
      <p className="text-xs text-muted">
        Es una tienda de demostración: usa la tarjeta de prueba 4242 4242 4242 4242, con cualquier
        fecha futura y cualquier CVC. No se cobra dinero real.
      </p>
    </>
  );
}
