'use client';

import { MyOrders } from './my-orders';
import type { PaymentReturn } from './order';
import { OrderDetail } from './order-detail';
import { RequireSession } from './require-session';

// Componentes de cliente: los pedidos se piden con el token, que vive en el navegador.

export function MyOrdersPage() {
  return <RequireSession returnTo="/pedidos">{(user) => <MyOrders user={user} />}</RequireSession>;
}

export function OrderPage({
  id,
  justPlaced,
  payment,
}: {
  id: string;
  justPlaced: boolean;
  payment?: PaymentReturn;
}) {
  return (
    <RequireSession returnTo={`/pedidos/${id}`}>
      {(user) => <OrderDetail user={user} id={id} justPlaced={justPlaced} payment={payment} />}
    </RequireSession>
  );
}
