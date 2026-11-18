import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ana, fakeAdapter } from '@/features/auth/test-helpers';
import { CheckoutButton } from './checkout-button';
import { placeOrderFromCart } from './checkout.actions';
import { ordersWrapper } from './test-utils';

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
// La Server Action solo existe dentro de Next: aquí es una función falsa.
vi.mock('./checkout.actions', () => ({ placeOrderFromCart: vi.fn() }));

describe('<CheckoutButton>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sin sesión invita a iniciar sesión y vuelve al carrito', async () => {
    render(<CheckoutButton />, { wrapper: ordersWrapper(fakeAdapter().adapter) });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Inicia sesión para comprar' }),
    );

    expect(router.push).toHaveBeenCalledWith('/entrar?volver=%2Fcarrito');
    expect(placeOrderFromCart).not.toHaveBeenCalled();
  });

  it('con sesión crea el pedido con el token y abre su página', async () => {
    vi.mocked(placeOrderFromCart).mockResolvedValue({ ok: true, orderId: 'abc' });
    render(<CheckoutButton />, { wrapper: ordersWrapper(fakeAdapter(ana).adapter) });
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar compra' }));

    expect(placeOrderFromCart).toHaveBeenCalledWith('token', 'id-token');
    expect(router.push).toHaveBeenCalledWith('/pedidos/abc?nuevo=1');
  });

  it('si la sesión venció en la API, vuelve a iniciar sesión', async () => {
    vi.mocked(placeOrderFromCart).mockResolvedValue({
      ok: false,
      reason: 'signin',
      message: 'Tu sesión venció.',
    });
    render(<CheckoutButton />, { wrapper: ordersWrapper(fakeAdapter(ana).adapter) });
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar compra' }));
    expect(router.push).toHaveBeenCalledWith('/entrar?volver=%2Fcarrito');
  });

  it('si falta stock, lo explica y recarga el carrito', async () => {
    vi.mocked(placeOrderFromCart).mockResolvedValue({
      ok: false,
      reason: 'error',
      message: 'Uno de los productos ya no tiene stock suficiente.',
    });
    render(<CheckoutButton />, { wrapper: ordersWrapper(fakeAdapter(ana).adapter) });
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar compra' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('stock suficiente');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('deshabilitado si el carrito tiene problemas', async () => {
    render(<CheckoutButton disabled />, { wrapper: ordersWrapper(fakeAdapter(ana).adapter) });
    expect(await screen.findByRole('button', { name: 'Continuar compra' })).toBeDisabled();
  });
});
