import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from './auth-provider';
import { ana, fakeAdapter, withAuth } from './test-helpers';

function Probe() {
  const { state, signOut, getAccessToken } = useAuth();
  return (
    <div>
      <p>{state.status === 'signedIn' ? `Sesión de ${state.user.name}` : state.status}</p>
      <button type="button" onClick={() => void signOut()}>
        Salir
      </button>
      <button type="button" onClick={async () => alert(await getAccessToken())}>
        Token
      </button>
    </div>
  );
}

describe('<AuthProvider>', () => {
  it('empieza cargando y luego muestra la sesión guardada', async () => {
    const { adapter } = fakeAdapter(ana);
    render(<Probe />, { wrapper: withAuth(adapter) });
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(await screen.findByText('Sesión de Ana María')).toBeInTheDocument();
  });

  it('se actualiza cuando el adaptador avisa un cambio (por ejemplo, desde otra pestaña)', async () => {
    const fake = fakeAdapter(null);
    render(<Probe />, { wrapper: withAuth(fake.adapter) });
    expect(await screen.findByText('signedOut')).toBeInTheDocument();

    fake.setUser(ana);
    await act(async () => fake.emit());
    expect(screen.getByText('Sesión de Ana María')).toBeInTheDocument();
  });

  it('al salir queda sin sesión', async () => {
    const { adapter } = fakeAdapter(ana);
    render(<Probe />, { wrapper: withAuth(adapter) });
    await userEvent.click(await screen.findByRole('button', { name: 'Salir' }));
    expect(await screen.findByText('signedOut')).toBeInTheDocument();
    expect(adapter.signOut).toHaveBeenCalled();
  });

  it('entrega el token del adaptador', async () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    const { adapter } = fakeAdapter(ana);
    render(<Probe />, { wrapper: withAuth(adapter) });
    await userEvent.click(await screen.findByRole('button', { name: 'Token' }));
    expect(alert).toHaveBeenCalledWith('token');
  });

  it('una sesión dañada se trata como "sin sesión"', async () => {
    const { adapter } = fakeAdapter(ana);
    adapter.currentUser.mockRejectedValue(new Error('token inválido'));
    render(<Probe />, { wrapper: withAuth(adapter) });
    expect(await screen.findByText('signedOut')).toBeInTheDocument();
  });

  it('useAuth fuera del proveedor avisa con un error claro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useAuth debe usarse dentro de <AuthProvider>');
  });
});
