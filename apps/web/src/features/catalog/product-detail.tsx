'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/ui/price';
import { AddToCart } from '@/features/cart/add-to-cart';
import { isNotFound, productQuery } from './catalog.queries';
import { catalogHref } from './catalog-params';
import { categoryLabel } from './product';
import { ProductImage } from './product-image';
import { QuantitySelect } from './quantity-select';

export function ProductDetail({ id }: { id: string }) {
  const {
    data: product,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery(productQuery(id));
  const [quantity, setQuantity] = useState(1);

  if (isPending) return <ProductDetailSkeleton />;

  if (isError) {
    return isNotFound(error) ? (
      <Message
        title="Este producto no existe"
        text="Puede que el enlace esté mal escrito o que lo hayamos retirado."
      >
        <Link href="/" className="text-sm font-semibold text-action hover:underline">
          Volver a la tienda
        </Link>
      </Message>
    ) : (
      <Message
        title="No pudimos cargar el producto"
        text="Revisa tu conexión e inténtalo de nuevo."
      >
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Reintentando…' : 'Reintentar'}
        </Button>
      </Message>
    );
  }

  const category = categoryLabel(product.category);

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="text-action hover:underline">
              Inicio
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <Link
              href={catalogHref({ category: product.category })}
              className="text-action hover:underline"
            >
              {category}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="truncate">
            {product.name}
          </li>
        </ol>
      </nav>

      <article className="grid gap-6 rounded-card bg-surface p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_300px]">
        <ProductImage
          name={product.name}
          category={product.category}
          imageUrl={product.imageUrl}
          className="md:row-span-2 lg:row-span-1"
        />

        {/* Información del producto */}
        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            {category} · SKU {product.sku}
          </span>
          <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-wide">
            {product.name}
          </h1>
          <p className="text-muted">{product.description}</p>
        </div>

        {/* Caja de compra: precio y acciones, como en las tiendas grandes */}
        <aside
          aria-label="Comprar"
          className="flex flex-col gap-4 rounded-card border border-line p-4 lg:self-start"
        >
          <Price priceCents={product.price.cents} currency={product.price.currency} size="lg" />

          {product.inStock ? (
            <>
              <span className="text-sm font-semibold text-deal">En stock</span>
              <QuantitySelect value={quantity} onChange={setQuantity} stock={product.stock} />
              <AddToCart productId={product.id} quantity={quantity} />
            </>
          ) : (
            <span className="text-sm font-semibold text-danger">
              Sin stock por ahora. Vuelve pronto.
            </span>
          )}

          <p className="border-t border-line pt-3 text-xs text-muted">
            Pago de prueba con Stripe: no se cobra dinero real.
          </p>
        </aside>
      </article>
    </div>
  );
}

function Message({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-5 py-16 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="max-w-sm text-muted">{text}</p>
      {children}
    </div>
  );
}

function ProductDetailSkeleton() {
  return (
    <div
      className="grid animate-pulse gap-6 rounded-card bg-surface p-6 md:grid-cols-2"
      aria-busy="true"
    >
      <span role="status" className="sr-only">
        Cargando producto…
      </span>
      <div className="aspect-square rounded-control bg-sunken" />
      <div className="flex flex-col gap-3">
        <div className="h-3 w-1/3 rounded bg-sunken" />
        <div className="h-7 w-3/4 rounded bg-sunken" />
        <div className="h-4 w-full rounded bg-sunken" />
        <div className="h-9 w-1/3 rounded bg-sunken" />
      </div>
    </div>
  );
}
