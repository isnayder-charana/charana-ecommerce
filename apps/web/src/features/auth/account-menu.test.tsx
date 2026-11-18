import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './account-menu';
import { ana, fakeAdapter, withAuth } from './test-helpers';

const navigation = vi.hoisted(() => ({ pathname: '/productos', query: 'q=teclado' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

describe('<AccountMenu>', () => {
  it('sin sesión muestra "Entrar" y recuerda la página actual', async () => {
    render(<AccountMenu />, { wrapper: withAuth(fakeAdapter().adapter) });
    expect(await screen.findByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/entrar?volver=%2Fproductos%3Fq%3Dteclado',
    );
  });

  it('en la propia página de entrar no pide volver a ella', async () => {
    navigation.pathname = '/entrar';
    render(<AccountMenu />, { wrapper: withAuth(fakeAdapter().adapter) });
    expect(await screen.findByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar');
    navigation.pathname = '/productos';
  });

  it('con sesión saluda por el primer nombre y permite salir', async () => {
    const { adapter } = fakeAdapter(ana);
    render(<AccountMenu />, { wrapper: withAuth(adapter) });

    expect(await screen.findByText('Hola, Ana')).toHaveAttribute('title', 'ana@correo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(adapter.signOut).toHaveBeenCalled();
    expect(await screen.findByRole('link', { name: 'Entrar' })).toBeInTheDocument();
  });
});
