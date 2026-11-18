import type { ProductFilters } from './catalog.queries';
import { CATEGORY_LABELS } from './product';

export const CATALOG_PAGE_SIZE = 12;

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Lee los filtros desde la URL (/productos?q=cable&categoria=cables&pagina=2).
 * Los valores raros se ignoran en lugar de romper la página: una categoría que no existe
 * o "pagina=abc" se tratan como si no estuvieran.
 */
export function parseCatalogParams(params: SearchParams): ProductFilters {
  const q = first(params.q)?.trim().slice(0, 100) || undefined;
  const categoria = first(params.categoria);
  const category = categoria && categoria in CATEGORY_LABELS ? categoria : undefined;
  const pagina = Number(first(params.pagina));
  const page = Number.isInteger(pagina) && pagina > 1 ? pagina : 1;

  return { q, category, page, pageSize: CATALOG_PAGE_SIZE };
}

/** Lo contrario: arma la URL del catálogo para unos filtros. Omite lo que está por defecto. */
export function catalogHref({ q, category, page }: ProductFilters): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('categoria', category);
  if (page && page > 1) params.set('pagina', String(page));
  const query = params.toString();
  return query ? `/productos?${query}` : '/productos';
}
