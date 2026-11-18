import type { Metadata } from 'next';
import { parsePaymentReturn } from '@/features/orders/order';
import { OrderPage } from '@/features/orders/order-page';

export const metadata: Metadata = { title: 'Detalle del pedido' };

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nuevo?: string; pago?: string }>;
}) {
  const { id } = await params;
  const { nuevo, pago } = await searchParams;
  return <OrderPage id={id} justPlaced={nuevo === '1'} payment={parsePaymentReturn(pago)} />;
}
