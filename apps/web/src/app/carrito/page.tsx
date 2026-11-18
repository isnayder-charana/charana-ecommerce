import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { countItems } from '@/features/cart/cart';
import { readCart } from '@/features/cart/cart-cookie';
import { CartLineItem, UnavailableLineItem } from '@/features/cart/cart-line-item';
import { loadCartItems } from '@/features/cart/cart-view';
import { CheckoutButton } from '@/features/orders/checkout-button';
import { formatMoney } from '@/lib/money';

export const metadata: Metadata = { title: 'Carrito' };

/** Componente de servidor: lee la cookie y pide los precios actuales a la API. */
export default async function CartPage() {
  const lines = await readCart();

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-5 py-16 text-center">
        <h1 className="text-xl font-bold">Tu carrito está vacío</h1>
        <p className="max-w-sm text-muted">Agrega productos desde el catálogo y aparecerán aquí.</p>
        <Link href="/productos" className={buttonClasses({ className: 'mt-2' })}>
          Ver catálogo
        </Link>
      </div>
    );
  }

  const items = await loadCartItems(lines);
  const available = items.filter((item) => item.status === 'ok');
  const totalCents = available.reduce(
    (sum, item) => sum + item.product.price.cents * item.line.quantity,
    0,
  );
  const currency = available[0]?.product.price.currency ?? 'USD';
  const hasProblems =
    items.some((item) => item.status === 'unavailable') ||
    available.some((item) => item.line.quantity > item.product.stock);
  const units = countItems(available.map((item) => item.line));

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-labelledby="titulo-carrito" className="rounded-card bg-surface px-4 sm:px-6">
        <h1 id="titulo-carrito" className="border-b border-line py-4 text-xl font-bold">
          Carrito
        </h1>
        <ul className="divide-y divide-line">
          {items.map((item) =>
            item.status === 'ok' ? (
              <CartLineItem
                key={item.line.productId}
                product={item.product}
                quantity={item.line.quantity}
              />
            ) : (
              <UnavailableLineItem key={item.line.productId} productId={item.line.productId} />
            ),
          )}
        </ul>
      </section>

      <aside
        aria-label="Resumen de compra"
        className="flex flex-col gap-4 rounded-card bg-surface p-5"
      >
        <h2 className="font-bold">Resumen de compra</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt>
              Productos ({units} {units === 1 ? 'unidad' : 'unidades'})
            </dt>
            <dd className="tabular-nums">{formatMoney(totalCents, currency)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-3 text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(totalCents, currency)}</dd>
          </div>
        </dl>
        <CheckoutButton disabled={hasProblems} />
        <p className="text-xs text-muted">
          {hasProblems
            ? 'Revisa los productos marcados en rojo antes de continuar.'
            : 'Al continuar se crea el pedido y se reserva el stock. El pago con Stripe llega en la fase 3.'}
        </p>
        <Link href="/productos" className="text-center text-sm text-action hover:underline">
          Seguir comprando
        </Link>
      </aside>
    </div>
  );
}
