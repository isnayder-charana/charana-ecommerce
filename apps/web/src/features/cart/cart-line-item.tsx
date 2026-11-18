'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Price } from '@/components/ui/price';
import { categoryLabel, type Product } from '@/features/catalog/product';
import { ProductImage } from '@/features/catalog/product-image';
import { QuantitySelect } from '@/features/catalog/quantity-select';
import { formatMoney } from '@/lib/money';
import { removeFromCart, updateCartQuantity } from './cart.actions';

export function CartLineItem({ product, quantity }: { product: Product; quantity: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const overStock = quantity > product.stock;

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? 'No se pudo actualizar el carrito.');
    });
  }

  return (
    <li
      className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 py-4 sm:grid-cols-[88px_minmax(0,1fr)_auto] aria-busy:opacity-60"
      aria-busy={isPending}
    >
      <ProductImage
        name={product.name}
        category={product.category}
        imageUrl={product.imageUrl}
        className="row-span-2 sm:row-span-1"
      />

      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {categoryLabel(product.category)}
        </span>
        <Link
          href={`/productos/${product.id}`}
          className="font-display text-sm font-bold uppercase leading-tight tracking-wide hover:text-action"
        >
          {product.name}
        </Link>
        <span className="text-xs text-muted">
          {formatMoney(product.price.cents, product.price.currency)} c/u
        </span>
        {overStock && (
          <span className="text-xs font-semibold text-danger">
            {product.stock === 0
              ? 'Se agotó: quítalo para continuar.'
              : `Solo quedan ${product.stock}: baja la cantidad para continuar.`}
          </span>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-start">
        <Price priceCents={product.price.cents * quantity} currency={product.price.currency} />
        <div className="flex items-center gap-3">
          <QuantitySelect
            id={`cantidad-${product.id}`}
            compact
            value={quantity}
            stock={product.stock}
            disabled={isPending}
            onChange={(value) => run(() => updateCartQuantity(product.id, value))}
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => removeFromCart(product.id))}
            className="text-sm text-action hover:underline"
          >
            Quitar
          </button>
        </div>
      </div>
    </li>
  );
}

/** Producto que estaba en el carrito pero la API ya no tiene. */
export function UnavailableLineItem({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <li className="flex items-center justify-between gap-3 py-4 text-sm">
      <span className="text-muted">Un producto de tu carrito ya no está a la venta.</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => void (await removeFromCart(productId)))}
        className="text-action hover:underline"
      >
        Quitar
      </button>
    </li>
  );
}
