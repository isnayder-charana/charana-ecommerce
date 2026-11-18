import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aProduct, jsonResponse } from '@/test/fixtures';
import { ProductDetail } from './product-detail';

// Los botones del carrito usan Server Actions, que solo existen dentro de Next.
// Aquí los reemplazamos por un componente simple que muestra qué cantidad recibiría.
vi.mock('@/features/cart/add-to-cart', () => ({
  AddToCart: ({ quantity }: { quantity: number }) => <p>Agregar {quantity}</p>,
}));

function renderDetail(id = aProduct().id) {
  // retryDelay: 0 → el reintento automático ocurre al instante (por defecto espera 1 segundo).
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ProductDetail id={id} />
    </QueryClientProvider>,
  );
}

describe('<ProductDetail>', () => {
  it('muestra la ficha y pasa la cantidad elegida a los botones de compra', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(aProduct())));
    renderDetail();

    expect(screen.getByRole('status')).toHaveTextContent('Cargando producto');
    expect(
      await screen.findByRole('heading', { name: 'Teclado mecánico compacto' }),
    ).toBeInTheDocument();
    expect(screen.getByText('(12 disponibles)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Periféricos' })).toHaveAttribute(
      'href',
      '/productos?categoria=perifericos',
    );

    await userEvent.selectOptions(screen.getByLabelText('Cantidad:'), '3');
    expect(screen.getByText('Agregar 3')).toBeInTheDocument();
  });

  it('sin stock no ofrece comprar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(aProduct({ stock: 0, inStock: false }))),
    );
    renderDetail();

    expect(await screen.findByText('Sin stock por ahora. Vuelve pronto.')).toBeInTheDocument();
    expect(screen.queryByText(/Agregar/)).not.toBeInTheDocument();
  });

  it('si el producto no existe lo dice', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ code: 'PRODUCT_NOT_FOUND', message: 'No existe' }, 404)),
    );
    renderDetail();

    expect(await screen.findByText('Este producto no existe')).toBeInTheDocument();
  });

  it('si la API falla permite reintentar', async () => {
    // productQuery reintenta una vez solo, así que fallamos dos veces antes de responder bien.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue(jsonResponse(aProduct())),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { name: 'Teclado mecánico compacto' }),
    ).toBeInTheDocument();
  });
});
