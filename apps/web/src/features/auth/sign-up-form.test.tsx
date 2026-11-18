import { autoSignIn, confirmSignUp, resendSignUpCode, signUp } from 'aws-amplify/auth';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignUpForm } from './sign-up-form';
import { fakeAdapter, withAuth } from './test-helpers';

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('aws-amplify/auth', () => ({
  signUp: vi.fn(),
  confirmSignUp: vi.fn(),
  resendSignUpCode: vi.fn(),
  autoSignIn: vi.fn(),
}));
vi.mock('./cognito-auth', () => ({ configureAmplify: vi.fn() }));

function renderForm(props: { returnTo?: string; confirmEmail?: string } = {}) {
  return render(<SignUpForm returnTo={props.returnTo ?? '/'} confirmEmail={props.confirmEmail} />, {
    wrapper: withAuth(fakeAdapter().adapter),
  });
}

async function typeCode(code: string) {
  await userEvent.type(screen.getByLabelText('Código de verificación'), code);
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar cuenta' }));
}

describe('<SignUpForm>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('explica qué le falta a la contraseña', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana');
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'prueba1234');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Incluye al menos una mayúscula.')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('registra, pide el código y al confirmarlo inicia sesión solo', async () => {
    vi.mocked(signUp).mockResolvedValue({
      isSignUpComplete: false,
      nextStep: { signUpStep: 'CONFIRM_SIGN_UP' },
    } as never);
    vi.mocked(confirmSignUp).mockResolvedValue({
      isSignUpComplete: true,
      nextStep: { signUpStep: 'COMPLETE_AUTO_SIGN_IN' },
    } as never);
    renderForm({ returnTo: '/carrito' });

    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana María');
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Prueba1234');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(signUp).toHaveBeenCalledWith({
      username: 'ana@correo.com',
      password: 'Prueba1234',
      options: { userAttributes: { email: 'ana@correo.com', name: 'Ana María' }, autoSignIn: true },
    });
    expect(await screen.findByText('ana@correo.com')).toBeInTheDocument();

    await typeCode('123456');
    expect(confirmSignUp).toHaveBeenCalledWith({
      username: 'ana@correo.com',
      confirmationCode: '123456',
    });
    expect(autoSignIn).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/carrito');
  });

  it('si el correo ya existe, lo dice', async () => {
    vi.mocked(signUp).mockRejectedValue(
      Object.assign(new Error('exists'), { name: 'UsernameExistsException' }),
    );
    renderForm();
    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana');
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@correo.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Prueba1234');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una cuenta');
  });

  it('al volver otro día: confirma y manda a iniciar sesión', async () => {
    vi.mocked(confirmSignUp).mockResolvedValue({
      isSignUpComplete: true,
      nextStep: { signUpStep: 'DONE' },
    } as never);
    renderForm({ confirmEmail: 'ana@correo.com', returnTo: '/carrito' });

    await typeCode('123456');
    expect(autoSignIn).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/entrar?confirmada=1&volver=%2Fcarrito');
  });

  it('valida el código y avisa si es incorrecto', async () => {
    vi.mocked(confirmSignUp).mockRejectedValue(
      Object.assign(new Error('bad'), { name: 'CodeMismatchException' }),
    );
    renderForm({ confirmEmail: 'ana@correo.com' });

    await typeCode('12');
    expect(await screen.findByText('El código tiene 6 números.')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Código de verificación'));
    await typeCode('654321');
    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto');
  });

  it('puede pedir otro código', async () => {
    vi.mocked(resendSignUpCode).mockResolvedValue({} as never);
    renderForm({ confirmEmail: 'ana@correo.com' });
    await userEvent.click(screen.getByRole('button', { name: 'Enviar otro código' }));

    expect(resendSignUpCode).toHaveBeenCalledWith({ username: 'ana@correo.com' });
    expect(await screen.findByRole('status')).toHaveTextContent('Te enviamos un código nuevo.');
  });

  it('avisa si no pudo reenviar el código', async () => {
    vi.mocked(resendSignUpCode).mockRejectedValue(
      Object.assign(new Error('x'), { name: 'LimitExceededException' }),
    );
    renderForm({ confirmEmail: 'ana@correo.com' });
    await userEvent.click(screen.getByRole('button', { name: 'Enviar otro código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos');
  });
});
