import type { Metadata } from 'next';
import { MyOrdersPage } from '@/features/orders/order-page';

export const metadata: Metadata = { title: 'Mis pedidos' };

export default function Page() {
  return <MyOrdersPage />;
}
