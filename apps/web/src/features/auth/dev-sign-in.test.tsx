import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { devAuth } from './dev-auth';
import { DevSignIn } from './dev-sign-in';
import { withAuth } from './test-helpers';

const router = { replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

describe('<DevSignIn>', () => {
  afterEach(() => localStorage.clear());

  it.each([
    ['Entrar como usuario de prueba', 'dev:ana'],
    ['Entrar como admin de prueba', 'dev:admin:admin'],
  ])('"%s" guarda el usuario y vuelve a donde estaba', async (button, token) => {
    render(<DevSignIn returnTo="/carrito" />, { wrapper: withAuth(devAuth, 'dev') });
    await userEvent.click(screen.getByRole('button', { name: button }));

    expect(await devAuth.accessToken()).toBe(token);
    expect(router.replace).toHaveBeenCalledWith('/carrito');
  });
});
