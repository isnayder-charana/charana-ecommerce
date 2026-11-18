import { describe, expect, it } from 'vitest';
import { CATALOG_PAGE_SIZE, catalogHref, parseCatalogParams } from './catalog-params';

describe('parseCatalogParams', () => {
  it('lee búsqueda, categoría y página', () => {
    expect(parseCatalogParams({ q: ' cable ', categoria: 'cables', pagina: '2' })).toEqual({
      q: 'cable',
      category: 'cables',
      page: 2,
      pageSize: CATALOG_PAGE_SIZE,
    });
  });

  it('ignora valores inválidos en lugar de fallar', () => {
    expect(parseCatalogParams({ q: '   ', categoria: 'nope', pagina: 'abc' })).toEqual({
      q: undefined,
      category: undefined,
      page: 1,
      pageSize: CATALOG_PAGE_SIZE,
    });
    expect(parseCatalogParams({ pagina: '-3' }).page).toBe(1);
  });

  it('si un parámetro viene repetido usa el primero', () => {
    expect(parseCatalogParams({ q: ['usb', 'otro'] }).q).toBe('usb');
  });
});

describe('catalogHref', () => {
  it('omite lo que está por defecto', () => {
    expect(catalogHref({})).toBe('/productos');
    expect(catalogHref({ page: 1 })).toBe('/productos');
  });

  it('arma la URL con los filtros', () => {
    expect(catalogHref({ q: 'cable usb', category: 'cables', page: 2 })).toBe(
      '/productos?q=cable+usb&categoria=cables&pagina=2',
    );
  });

  it('ida y vuelta: la URL que arma se lee igual', () => {
    const filters = { q: 'teclado', category: 'perifericos', page: 3, pageSize: CATALOG_PAGE_SIZE };
    const params = Object.fromEntries(new URL(catalogHref(filters), 'http://x').searchParams);
    expect(parseCatalogParams(params)).toEqual(filters);
  });
});
