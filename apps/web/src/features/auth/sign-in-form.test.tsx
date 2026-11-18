import { signIn } from 'aws-amplify/auth';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInForm } from './sign-in-form';
import { ana, fakeAdapter, withAuth } from './test-helpers';

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('aws-amplify/auth', () => ({ signIn: vi.fn() }));
vi.mock('./cognito-auth', () => ({ configureAmplify: vi.fn() }));

function cognitoError(name: string) {
  return Object.assign(new Error('Cognito'), { name });
}

async function fillAndSubmit(email = 'Ana@Correo.com', password = 'Prueba1234') {
  await userEvent.type(screen.getByLabelText('Correo'), email);
  await userEvent.type(screen.getByLabelText('Contraseña'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('<SignInForm>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('valida antes de llamar a Cognito', async () => {
    render(<SignInForm returnTo="/" />, { wrapper: withAuth(fakeAdapter().adapter) });
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Escribe un correo válido.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('inicia sesión con el correo normalizado y vuelve a donde estaba', async () => {
    const fake = fakeAdapter();
    vi.mocked(signIn).mockImplementation(async () => {
      fake.setUser(ana);
      return { isSignedIn: true, nextStep: { signInStep: 'DONE' } };
    });
    render(<SignInForm returnTo="/carrito" />, { wrapper: withAuth(fake.adapter) });
    await fillAndSubmit();

    expect(signIn).toHaveBeenCalledWith({ username: 'ana@correo.com', password: 'Prueba1234' });
    expect(router.replace).toHaveBeenCalledWith('/carrito');
  });

  it('muestra un mensaje claro si la contraseña es incorrecta', async () => {
    vi.mocked(signIn).mockRejectedValue(cognitoError('NotAuthorizedException'));
    render(<SignInForm returnTo="/" />, { wrapper: withAuth(fakeAdapter().adapter) });
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('si la cuenta no está confirmada, lleva a escribir el código', async () => {
    vi.mocked(signIn).mockRejectedValue(cognitoError('UserNotConfirmedException'));
    render(<SignInForm returnTo="/carrito" />, { wrapper: withAuth(fakeAdapter().adapter) });
    await fillAndSubmit();

    expect(router.push).toHaveBeenCalledWith(
      '/registro?confirmar=ana%40correo.com&volver=%2Fcarrito',
    );
  });

  it('también cuando Cognito lo pide como siguiente paso', async () => {
    vi.mocked(signIn).mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_UP' },
    });
    render(<SignInForm returnTo="/" />, { wrapper: withAuth(fakeAdapter().adapter) });
    await fillAndSubmit();
    expect(router.push).toHaveBeenCalledWith('/registro?confirmar=ana%40correo.com');
  });

  it('si ya había una sesión abierta, simplemente continúa', async () => {
    vi.mocked(signIn).mockRejectedValue(cognitoError('UserAlreadyAuthenticatedException'));
    render(<SignInForm returnTo="/carrito" />, { wrapper: withAuth(fakeAdapter(ana).adapter) });
    await fillAndSubmit();
    expect(router.replace).toHaveBeenCalledWith('/carrito');
  });

  it('avisa si Cognito pide un paso que la tienda no admite', async () => {
    vi.mocked(signIn).mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'RESET_PASSWORD' },
    });
    render(<SignInForm returnTo="/" />, { wrapper: withAuth(fakeAdapter().adapter) });
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent('paso extra');
  });

  it('muestra el aviso de cuenta confirmada y el enlace para registrarse', () => {
    render(<SignInForm returnTo="/carrito" notice="Cuenta confirmada." />, {
      wrapper: withAuth(fakeAdapter().adapter),
    });
    expect(screen.getByRole('status')).toHaveTextContent('Cuenta confirmada.');
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute(
      'href',
      '/registro?volver=%2Fcarrito',
    );
  });
});
