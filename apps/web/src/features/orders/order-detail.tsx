'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { useAuth } from '@/features/auth/auth-provider';
import type { SessionUser } from '@/features/auth/session';
import { ApiError } from '@/lib/api-client';
import { formatMoney } from '@/lib/money';
import {
  canCancel,
  formatDate,
  orderNumber,
  type PaymentReturn,
  refreshInterval,
  STATUS_LABELS,
} from './order';
import { OrderStatusBadge } from './order-status-badge';
import { PayButton } from './pay-button';
import { cancelOrder, isClientError, orderQuery } from './orders.queries';

export function OrderDetail({
  user,
  id,
  justPlaced = false,
  payment,
}: {
  user: SessionUser;
  id: string;
  /** Recién creado desde el carrito (?nuevo=1): muestra la confirmación. */
  justPlaced?: boolean;
  /** Vuelta desde Stripe (?pago=exito o ?pago=cancelado). */
  payment?: PaymentReturn;
}) {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const query = orderQuery(user.id, id, getAccessToken);
  const {
    data: order,
    isPending,
    error,
    refetch,
  } = useQuery({
    ...query,
    // El pedido cambia solo (webhook de Stripe, almacén): volvemos a preguntar mientras
    // pueda cambiar. Con la pestaña en segundo plano, TanStack Query no pregunta.
    refetchInterval: (q) => refreshInterval(q.state.data?.status, payment, q.state.dataUpdateCount),
  });
  const [confirming, setConfirming] = useState(false);

  const cancel = useMutation({
    mutationFn: () => cancelOrder(id, getAccessToken),
    onSuccess: (updated) => {
      // La respuesta ya es el pedido actualizado: se guarda directo, sin volver a pedirlo.
      queryClient.setQueryData(query.queryKey, updated);
      void queryClient.invalidateQueries({ queryKey: ['orders', user.id], exact: true });
      setConfirming(false);
    },
  });

  if (isPending) {
    return (
      <p role="status" className="py-10 text-center text-muted">
        Cargando pedido…
      </p>
    );
  }

  if (error) {
    // 404 también si el pedido es de otra persona: la API no revela que existe.
    const missing = isClientError(error);
    return (
      <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-5 py-16 text-center">
        <h1 className="text-xl font-bold">
          {missing ? 'No encontramos este pedido' : 'No pudimos cargar el pedido'}
        </h1>
        {missing ? (
          <Link href="/pedidos" className="text-sm font-semibold text-action hover:underline">
            Ver mis pedidos
          </Link>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-labelledby="titulo-pedido" className="rounded-card bg-surface px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3 border-b border-line py-4">
          <h1 id="titulo-pedido" className="text-xl font-bold">
            Pedido #{orderNumber(order)}
          </h1>
          <OrderStatusBadge status={order.status} />
          <span className="text-sm text-muted sm:ml-auto">{formatDate(order.createdAt)}</span>
        </div>

        {payment === 'exito' && order.status === 'PAID' && (
          <div className="pt-4">
            <FormAlert tone="success">
              ¡Pago confirmado! Te avisaremos cuando tu pedido salga del almacén.
            </FormAlert>
          </div>
        )}
        {order.status === 'PENDING_PAYMENT' && (justPlaced || payment) && (
          <div className="pt-4">
            {payment === 'exito' ? (
              <FormAlert tone="success">
                ¡Gracias! Stripe está confirmando tu pago. En cuanto avise, el pedido pasará a
                Pagado.
              </FormAlert>
            ) : payment === 'cancelado' ? (
              <FormAlert tone="info">
                No se completó el pago. Tu pedido sigue reservado: puedes pagarlo cuando quieras.
              </FormAlert>
            ) : (
              <FormAlert tone="success">
                ¡Pedido creado! Reservamos el stock para ti. Págalo con Stripe para confirmarlo.
              </FormAlert>
            )}
          </div>
        )}

        <ul className="divide-y divide-line">
          {order.lines.map((line) => (
            <li key={line.productId} className="flex items-center gap-4 py-4">
              <span className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`/productos/${line.productId}`}
                  className="font-semibold hover:text-action"
                >
                  {line.name}
                </Link>
                <span className="text-sm text-muted">
                  {line.quantity} × {formatMoney(line.unitPrice.cents, line.unitPrice.currency)}
                </span>
              </span>
              <span className="font-semibold tabular-nums">
                {formatMoney(line.subtotal.cents, line.subtotal.currency)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-line py-4 text-base font-bold">
          <span>Total</span>
          <span className="tabular-nums">
            {formatMoney(order.total.cents, order.total.currency)}
          </span>
        </div>
      </section>

      <aside
        aria-label="Estado del pedido"
        className="flex flex-col gap-4 rounded-card bg-surface p-5"
      >
        <h2 className="font-bold">Seguimiento</h2>
        <ol className="flex flex-col gap-3 border-l-2 border-line pl-4">
          {order.history.map((step) => (
            <li key={`${step.status}-${step.at}`} className="flex flex-col">
              <span className="text-sm font-semibold">{STATUS_LABELS[step.status]}</span>
              <span className="text-xs text-muted">{formatDate(step.at)}</span>
            </li>
          ))}
        </ol>

        {order.status === 'PENDING_PAYMENT' && !confirming && <PayButton orderId={order.id} />}

        {canCancel(order) && !confirming && (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Cancelar pedido
          </Button>
        )}
        {canCancel(order) && confirming && (
          <div className="flex flex-col gap-2 rounded-control bg-sunken p-3">
            <p className="text-sm">
              {order.status === 'PAID'
                ? '¿Seguro? Te devolvemos el dinero a tu tarjeta. No se puede deshacer.'
                : '¿Seguro? El stock vuelve a la tienda y no se puede deshacer.'}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 bg-danger hover:bg-danger/90"
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? 'Cancelando…' : 'Sí, cancelar'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirming(false)}
                disabled={cancel.isPending}
              >
                No
              </Button>
            </div>
          </div>
        )}
        {cancel.isError && (
          <FormAlert>
            {cancel.error instanceof ApiError && cancel.error.code === 'INVALID_ORDER_TRANSITION'
              ? 'Este pedido ya no se puede cancelar.'
              : 'No pudimos cancelar el pedido. Inténtalo otra vez.'}
          </FormAlert>
        )}

        <Link href="/pedidos" className="text-center text-sm text-action hover:underline">
          Ver todos mis pedidos
        </Link>
      </aside>
    </div>
  );
}
