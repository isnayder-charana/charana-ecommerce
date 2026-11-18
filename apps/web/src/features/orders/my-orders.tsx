'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button, buttonClasses } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-provider';
import type { SessionUser } from '@/features/auth/session';
import { formatMoney } from '@/lib/money';
import { countUnits, formatDate, orderNumber } from './order';
import { OrderStatusBadge } from './order-status-badge';
import { myOrdersQuery } from './orders.queries';

/** "Mis pedidos": del más nuevo al más antiguo (la API ya los ordena). */
export function MyOrders({ user }: { user: SessionUser }) {
  const { getAccessToken } = useAuth();
  const { data, isPending, isError, refetch } = useQuery(myOrdersQuery(user.id, getAccessToken));

  return (
    <section aria-labelledby="titulo-pedidos" className="rounded-card bg-surface px-4 sm:px-6">
      <h1 id="titulo-pedidos" className="border-b border-line py-4 text-xl font-bold">
        Mis pedidos
      </h1>

      {isPending && (
        <p role="status" className="py-10 text-center text-muted">
          Cargando pedidos…
        </p>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-muted">No pudimos cargar tus pedidos.</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {data?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-semibold">Todavía no tienes pedidos</p>
          <Link href="/productos" className={buttonClasses({ size: 'sm' })}>
            Ver catálogo
          </Link>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="divide-y divide-line">
          {data.map((order) => {
            const units = countUnits(order);
            return (
              <li key={order.id}>
                <Link
                  href={`/pedidos/${order.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4 hover:bg-sunken/60 sm:-mx-3 sm:px-3"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">Pedido #{orderNumber(order)}</span>
                    <span className="text-sm text-muted">
                      {formatDate(order.createdAt)} · {units} {units === 1 ? 'unidad' : 'unidades'}
                    </span>
                  </span>
                  <OrderStatusBadge status={order.status} />
                  <span className="w-24 text-right font-bold tabular-nums">
                    {formatMoney(order.total.cents, order.total.currency)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
