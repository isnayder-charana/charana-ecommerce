import type { Order } from '@/features/orders/order';
import type { Product, ProductList } from '@/features/catalog/product';

/** Producto de ejemplo para los tests. `overrides` cambia solo lo que el test necesita. */
export function aProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1004',
    sku: 'CT-PER-001',
    name: 'Teclado mecánico compacto',
    description: 'Formato 75%.',
    category: 'perifericos',
    price: { cents: 8999, currency: 'USD' },
    stock: 12,
    inStock: true,
    imageUrl: null,
    ...overrides,
  };
}

export function aProductList(items: Product[]): ProductList {
  return { items, page: 1, pageSize: 12, total: items.length, totalPages: 1 };
}

/** Reemplaza fetch por una respuesta fija (la API no corre durante los tests). */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Pedido de ejemplo con la forma de OrderView de la API. */
export function anOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'd7e25385-0b1c-4c1e-9a52-0c7f3a9e2001',
    status: 'PENDING_PAYMENT',
    lines: [
      {
        productId: '7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1004',
        sku: 'CT-PER-001',
        name: 'Teclado mecánico compacto',
        unitPrice: { cents: 8999, currency: 'USD' },
        quantity: 2,
        subtotal: { cents: 17998, currency: 'USD' },
      },
    ],
    total: { cents: 17998, currency: 'USD' },
    history: [{ status: 'PENDING_PAYMENT', at: '2026-11-13T23:13:00.000Z' }],
    createdAt: '2026-11-13T23:13:00.000Z',
    ...overrides,
  };
}
