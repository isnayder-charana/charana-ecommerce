import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import type { Metadata } from 'next';
import Link from 'next/link';
import { productsQuery } from '@/features/catalog/catalog.queries';
import { catalogHref, parseCatalogParams } from '@/features/catalog/catalog-params';
import { CATEGORY_LABELS, categoryLabel } from '@/features/catalog/product';
import { ProductGrid } from '@/features/catalog/product-grid';
import { cn } from '@/lib/cn';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Catálogo: /productos?q=cable&categoria=cables&pagina=2
 * Los filtros viven en la URL, así una búsqueda se puede compartir, guardar o recargar.
 */
export default async function CatalogPage({ searchParams }: PageProps) {
  const filters = parseCatalogParams(await searchParams);

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery(productsQuery(filters));

  const category = filters.category ? categoryLabel(filters.category) : undefined;
  const title = filters.q
    ? `Resultados para “${filters.q}”${category ? ` en ${category}` : ''}`
    : (category ?? 'Todos los productos');

  return (
    <div className="grid gap-5 md:grid-cols-[200px_minmax(0,1fr)]">
      <aside aria-label="Filtros" className="flex min-w-0 flex-col gap-2">
        <h2 className="text-sm font-bold">Categorías</h2>
        <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:gap-0.5 md:overflow-visible">
          {[['', 'Todas'] as const, ...Object.entries(CATEGORY_LABELS)].map(([slug, label]) => {
            const active = (filters.category ?? '') === slug;
            return (
              <li key={slug} className="shrink-0">
                <Link
                  // Al cambiar de categoría se conserva la búsqueda y se vuelve a la página 1.
                  href={catalogHref({ q: filters.q, category: slug || undefined })}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block rounded-control px-3 py-1.5 text-sm',
                    active
                      ? 'bg-action-soft font-semibold text-action'
                      : 'bg-surface text-ink hover:text-action md:bg-transparent',
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      <section aria-labelledby="titulo-catalogo" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 id="titulo-catalogo" className="text-xl font-bold">
            {title}
          </h1>
          {(filters.q || filters.category) && (
            <Link href={catalogHref({})} className="text-sm text-action hover:underline">
              Quitar filtros
            </Link>
          )}
        </div>

        <HydrationBoundary state={dehydrate(queryClient)}>
          <ProductGrid filters={filters} paginated />
        </HydrationBoundary>
      </section>
    </div>
  );
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { q, category } = parseCatalogParams(await searchParams);
  if (q) return { title: `Buscar “${q}”` };
  if (category) return { title: categoryLabel(category) };
  return { title: 'Catálogo' };
}
