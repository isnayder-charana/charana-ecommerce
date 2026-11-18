import { signInWithRedirect } from 'aws-amplify/auth';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleButton } from './google-button';
import { takeReturnTo } from './return-to';

vi.mock('aws-amplify/auth', () => ({ signInWithRedirect: vi.fn() }));
vi.mock('./cognito-auth', () => ({ configureAmplify: vi.fn() }));

describe('<GoogleButton>', () => {
  afterEach(() => sessionStorage.clear());

  it('guarda la ruta de regreso y sale hacia Google', async () => {
    vi.mocked(signInWithRedirect).mockReturnValue(new Promise(() => {})); // el navegador se va
    render(<GoogleButton returnTo="/carrito" />);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));

    expect(signInWithRedirect).toHaveBeenCalledWith({ provider: 'Google' });
    expect(screen.getByRole('button', { name: 'Abriendo Google…' })).toBeDisabled();
    expect(takeReturnTo()).toBe('/carrito');
  });

  it('si algo falla, vuelve a habilitar el botón y lo explica', async () => {
    vi.mocked(signInWithRedirect).mockRejectedValue(
      Object.assign(new Error('x'), { name: 'NetworkError' }),
    );
    render(<GoogleButton returnTo="/" />);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión');
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled();
  });
});
