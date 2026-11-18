import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { aProduct, aProductList, jsonResponse } from '@/test/fixtures';
import { ProductGrid } from './product-grid';

/** Cada test con su propia caché y sin reintentos, para que los errores aparezcan al toque. */
function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('<ProductGrid>', () => {
  it('muestra el estado de carga y luego los productos', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            aProductList([aProduct(), aProduct({ id: crypto.randomUUID(), name: 'Mouse' })]),
          ),
        ),
    );
    renderWithQuery(<ProductGrid />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando productos');
    expect(await screen.findByText('Teclado mecánico compacto')).toBeInTheDocument();
    expect(screen.getByText('Mouse')).toBeInTheDocument();
  });

  it('en el catálogo muestra el total y la paginación', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ...aProductList([aProduct()]), total: 15, totalPages: 2 }),
        ),
    );
    renderWithQuery(<ProductGrid filters={{ q: 'teclado', page: 1 }} paginated />);

    expect(await screen.findByText('15 resultados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute(
      'href',
      '/productos?q=teclado&pagina=2',
    );
  });

  it('si la búsqueda no encuentra nada lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(aProductList([]))));
    renderWithQuery(<ProductGrid filters={{ q: 'zzz' }} />);

    expect(await screen.findByText('No encontramos productos para “zzz”.')).toBeInTheDocument();
  });

  it('si la API falla permite reintentar', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(jsonResponse(aProductList([aProduct()])));
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<ProductGrid />);

    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Teclado mecánico compacto')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
