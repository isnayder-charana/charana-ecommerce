import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ana, fakeAdapter } from '@/features/auth/test-helpers';
import { anOrder, jsonResponse } from '@/test/fixtures';
import { goTo } from '@/lib/navigation';
import type { OrderEmail } from './order';
import { MyOrdersPage, OrderPage } from './order-page';
import { ordersWrapper } from './test-utils';

// Ir a Stripe es salir de la página: en los tests solo comprobamos a dónde iríamos.
vi.mock('@/lib/navigation', () => ({ goTo: vi.fn() }));

/**
 * `fetch` falso: las respuestas van en orden a las peticiones de pedidos.
 * Los correos del pedido (/emails) se responden aparte, con `emails` (por defecto, ninguno).
 */
function mockApi(...responses: Response[]) {
  return mockApiWithEmails([], ...responses).api;
}

function mockApiWithEmails(emails: OrderEmail[], ...responses: Response[]) {
  const api = vi.fn();
  for (const response of responses) api.mockResolvedValueOnce(response);
  const emailsApi = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(emails));
  vi.stubGlobal('fetch', (url: URL, init: RequestInit) =>
    String(url).endsWith('/emails') ? emailsApi(url, init) : api(url, init),
  );
  return { api, emailsApi };
}

describe('Mis pedidos', () => {
  it('sin sesión pide iniciar sesión', async () => {
    render(<MyOrdersPage />, { wrapper: ordersWrapper(fakeAdapter().adapter) });
    expect(await screen.findByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute(
      'href',
      '/entrar?volver=%2Fpedidos',
    );
  });

  it('lista los pedidos pidiéndolos con el token', async () => {
    const fetchMock = mockApi(
      jsonResponse([
        anOrder(),
        anOrder({ id: 'a1b2c3d4-0000-4000-8000-000000000000', status: 'CANCELLED' }),
      ]),
    );
    render(<MyOrdersPage />, { wrapper: ordersWrapper(fakeAdapter(ana).adapter) });

    expect(await screen.findByText('Pedido #D7E25385')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Pedido #/ })[0]).toHaveAttribute(
      'href',
      `/pedidos/${anOrder().id}`,
    );
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token' });
  });

  it('sin pedidos invita al catálogo', async () => {
    mockApi(jsonResponse([]));
    render(<MyOrdersPage />, { wrapper: ordersWrapper(fakeAdapter(ana).adapter) });
    expect(await screen.findByText('Todavía no tienes pedidos')).toBeInTheDocument();
  });

  it('si la API falla, permite reintentar', async () => {
    mockApi(new Response(null, { status: 503 }), jsonResponse([anOrder()]));
    render(<MyOrdersPage />, { wrapper: ordersWrapper(fakeAdapter(ana).adapter) });
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Pedido #D7E25385')).toBeInTheDocument();
  });
});

describe('Detalle del pedido', () => {
  const id = anOrder().id;

  it('muestra líneas, total, seguimiento y la confirmación de pedido nuevo', async () => {
    mockApi(jsonResponse(anOrder()));
    render(<OrderPage id={id} justPlaced />, { wrapper: ordersWrapper(fakeAdapter(ana).adapter) });

    expect(await screen.findByRole('heading', { name: 'Pedido #D7E25385' })).toBeInTheDocument();
    expect(screen.getByText('¡Pedido creado!', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Teclado mecánico compacto' })).toBeInTheDocument();
    expect(screen.getByText('2 × $ 89.99')).toBeInTheDocument();
    expect(screen.getAllByText('$ 179.98')).toHaveLength(2); // subtotal y total
  });

  it('cancela después de confirmar y muestra el nuevo estado', async () => {
    const cancelled = anOrder({
      status: 'CANCELLED',
      history: [...anOrder().history, { status: 'CANCELLED', at: '2026-11-13T23:20:00.000Z' }],
    });
    const fetchMock = mockApi(
      jsonResponse(anOrder()),
      jsonResponse(cancelled),
      jsonResponse([cancelled]),
    );
    render(<OrderPage id={id} justPlaced={false} />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    await userEvent.click(screen.getByRole('button', { name: 'No' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));

    expect((await screen.findAllByText('Cancelado')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(String(url)).toMatch(`/orders/${id}/cancel`);
    expect(init.method).toBe('POST');
  });

  it('si ya no se puede cancelar, lo explica', async () => {
    mockApi(
      jsonResponse(anOrder({ status: 'PAID' })),
      jsonResponse({ code: 'INVALID_ORDER_TRANSITION', message: 'x' }, 409),
    );
    render(<OrderPage id={id} justPlaced={false} />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya no se puede cancelar');
  });

  it('un pedido ajeno o inexistente se ve como "no encontrado"', async () => {
    mockApi(jsonResponse({ code: 'ORDER_NOT_FOUND', message: 'x' }, 404));
    render(<OrderPage id={id} justPlaced={false} />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });
    expect(await screen.findByText('No encontramos este pedido')).toBeInTheDocument();
  });

  it('si la API falla, permite reintentar', async () => {
    // orderQuery reintenta una vez los 5xx por su cuenta: fallan los dos intentos.
    mockApi(
      new Response(null, { status: 500 }),
      new Response(null, { status: 500 }),
      jsonResponse(anOrder({ status: 'DELIVERED' })),
    );
    render(<OrderPage id={id} justPlaced={false} />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByText('Entregado', { selector: 'span.inline-block' }),
    ).toBeInTheDocument();
  });

  it('Pagar con Stripe pide la sesión a la API y lleva a la página de pago', async () => {
    const fetchMock = mockApi(
      jsonResponse(anOrder()),
      jsonResponse({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
    );
    render(<OrderPage id={id} justPlaced={false} />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Pagar con Stripe' }));

    await vi.waitFor(() =>
      expect(goTo).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1'),
    );
    expect(screen.getByRole('button', { name: 'Abriendo Stripe…' })).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(String(url)).toMatch(`/orders/${id}/checkout`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined(); // el monto lo pone el servidor, no el navegador
  });

  it.each([
    ['PAYMENTS_NOT_CONFIGURED', 503, 'no están disponibles'],
    ['ORDER_NOT_PAYABLE', 409, 'ya no se puede pagar'],
    ['HTTP_ERROR', 500, 'No pudimos abrir la página de pago'],
  ])('si la API responde %s, lo explica', async (code, status, text) => {
    mockApi(jsonResponse(anOrder()), jsonResponse({ code, message: 'x' }, status));
    render(<OrderPage id={id} justPlaced={false} />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar con Stripe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('solo ofrece pagar pedidos pendientes de pago', async () => {
    mockApi(jsonResponse(anOrder({ status: 'PAID' })));
    render(<OrderPage id={id} justPlaced={false} />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });
    expect(await screen.findByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pagar con Stripe' })).not.toBeInTheDocument();
  });

  it.each([
    ['exito', 'Stripe está confirmando tu pago'],
    ['cancelado', 'No se completó el pago'],
  ] as const)('al volver de Stripe con ?pago=%s muestra el aviso', async (payment, text) => {
    mockApi(jsonResponse(anOrder()));
    render(<OrderPage id={id} justPlaced={false} payment={payment} />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });
    expect(await screen.findByText(text, { exact: false })).toBeInTheDocument();
  });

  it('al volver de Stripe consulta el pedido hasta ver el pago confirmado', async () => {
    const paid = anOrder({
      status: 'PAID',
      history: [...anOrder().history, { status: 'PAID', at: '2026-11-15T21:00:00.000Z' }],
    });
    const fetchMock = mockApi(jsonResponse(anOrder()), jsonResponse(paid));
    render(<OrderPage id={id} justPlaced={false} payment="exito" />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });

    expect(
      await screen.findByText('Stripe está confirmando tu pago', { exact: false }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('¡Pago confirmado!', { exact: false }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Pagar con Stripe' })).not.toBeInTheDocument();
  });

  it('al cancelar un pedido pagado avisa que devolvemos el dinero', async () => {
    mockApi(jsonResponse(anOrder({ status: 'PAID' })));
    render(<OrderPage id={id} justPlaced={false} />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    expect(screen.getByText('Te devolvemos el dinero', { exact: false })).toBeInTheDocument();
  });

  it('muestra los correos del pedido, también el que SES no envió (sandbox)', async () => {
    const shipped = anOrder({
      status: 'SHIPPED',
      history: [
        ...anOrder().history,
        { status: 'PAID', at: '2026-11-13T23:15:00.000Z' },
        { status: 'SHIPPED', at: '2026-11-13T23:16:00.000Z' },
      ],
    });
    const { emailsApi } = mockApiWithEmails(
      [
        {
          subject: 'Recibimos tu pago · Pedido D7E25385',
          text: '¡Gracias por tu compra!\n\nConfirmamos tu pago.',
          occurredAt: '2026-11-13T23:15:00.000Z',
          delivered: true,
        },
        {
          subject: 'Tu pedido va en camino · Pedido D7E25385',
          text: 'Tu pedido salió de nuestro almacén',
          occurredAt: '2026-11-13T23:16:00.000Z',
          delivered: false,
        },
      ],
      jsonResponse(shipped),
    );
    render(<OrderPage id={id} justPlaced={false} />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });

    expect(
      await screen.findByRole('heading', { name: 'Correos de este pedido' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Enviado a tu correo')).toBeInTheDocument();
    expect(screen.getByText('No enviado (demo)')).toBeInTheDocument();
    expect(
      screen.getByText('el correo que te habríamos enviado', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('Tu pedido salió de nuestro almacén')).toBeInTheDocument();
    const [url, init] = emailsApi.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toMatch(`/orders/${id}/emails`);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token' });
  });

  it('un pedido sin pagar no pide correos (todavía no hay)', async () => {
    const { emailsApi } = mockApiWithEmails([], jsonResponse(anOrder()));
    render(<OrderPage id={id} justPlaced={false} />, {
      wrapper: ordersWrapper(fakeAdapter(ana).adapter),
    });
    expect(await screen.findByRole('heading', { name: 'Pedido #D7E25385' })).toBeInTheDocument();
    expect(emailsApi).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Correos de este pedido' }),
    ).not.toBeInTheDocument();
  });
});
