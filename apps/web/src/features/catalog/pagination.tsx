import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { ProductFilters } from './catalog.queries';
import { catalogHref } from './catalog-params';

/** Paginación con enlaces reales: se puede abrir una página en otra pestaña o compartirla. */
export function Pagination({
  filters,
  totalPages,
}: {
  filters: ProductFilters;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const current = filters.page ?? 1;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  const item = 'grid h-9 min-w-9 place-items-center rounded-control px-3 text-sm font-semibold';

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-center gap-1.5">
      {current > 1 && (
        <Link
          href={catalogHref({ ...filters, page: current - 1 })}
          className={cn(item, 'text-action')}
        >
          ‹ Anterior
        </Link>
      )}
      {pages.map((page) =>
        page === current ? (
          <span key={page} aria-current="page" className={cn(item, 'bg-action text-white')}>
            {page}
          </span>
        ) : (
          <Link
            key={page}
            href={catalogHref({ ...filters, page })}
            className={cn(item, 'bg-surface text-action hover:bg-action-soft')}
          >
            {page}
          </Link>
        ),
      )}
      {current < totalPages && (
        <Link
          href={catalogHref({ ...filters, page: current + 1 })}
          className={cn(item, 'text-action')}
        >
          Siguiente ›
        </Link>
      )}
    </nav>
  );
}
