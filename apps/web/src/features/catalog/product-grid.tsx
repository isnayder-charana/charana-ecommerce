'use client';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { type ProductFilters, productsQuery } from './catalog.queries';
import { catalogHref } from './catalog-params';
import { Pagination } from './pagination';
import { ProductCard } from './product-card';
import Link from 'next/link';

const GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3';

/**
 * Lista de productos con sus estados: cargando, error, vacío y datos.
 * Con `paginated` muestra además cuántos resultados hay y la paginación (página de catálogo).
 */
export function ProductGrid({
  filters = {},
  paginated = false,
}: {
  filters?: ProductFilters;
  paginated?: boolean;
}) {
  const { data, isPending, isError, refetch, isFetching } = useQuery(productsQuery(filters));

  if (isPending) {
    return (
      <div className={GRID} aria-busy="true">
        <span role="status" className="sr-only">
          Cargando productos…
        </span>
        {Array.from({ length: filters.pageSize ?? 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: marcadores fijos que nunca cambian de orden
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-5 py-10 text-center">
        <p className="font-semibold">No pudimos cargar los productos.</p>
        <p className="text-sm text-muted">Revisa tu conexión e inténtalo de nuevo.</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Reintentando…' : 'Reintentar'}
        </Button>
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card bg-surface px-5 py-10 text-center">
        <p className="font-semibold">
          {filters.q
            ? `No encontramos productos para “${filters.q}”.`
            : 'No hay productos en esta categoría todavía.'}
        </p>
        <p className="text-sm text-muted">Prueba con otra palabra o revisa todas las categorías.</p>
        <Link href={catalogHref({})} className="text-sm font-semibold text-action hover:underline">
          Ver todos los productos
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {paginated && (
        <p className="text-sm text-muted" aria-live="polite">
          {data.total} {data.total === 1 ? 'resultado' : 'resultados'}
        </p>
      )}
      <div className={GRID}>
        {data.items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {paginated && <Pagination filters={filters} totalPages={data.totalPages} />}
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-2 rounded-card border border-line bg-surface p-2.5">
      <div className="aspect-square rounded-control bg-sunken" />
      <div className="h-3 w-1/3 rounded bg-sunken" />
      <div className="h-4 w-3/4 rounded bg-sunken" />
      <div className="h-5 w-1/2 rounded bg-sunken" />
    </div>
  );
}
