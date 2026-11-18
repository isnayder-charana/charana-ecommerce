import { describe, expect, it } from 'vitest';
import { authErrorMessage, authErrorName } from './auth-errors';
import { signInSchema, signUpSchema } from './auth-schemas';
import { firstName } from './session';

function cognitoError(name: string) {
  const error = new Error('Incorrect username or password.');
  error.name = name;
  return error;
}

describe('authErrorMessage', () => {
  it('traduce los errores de Cognito', () => {
    expect(authErrorMessage(cognitoError('NotAuthorizedException'))).toBe(
      'Correo o contraseña incorrectos.',
    );
    expect(authErrorMessage(cognitoError('CodeMismatchException'))).toMatch(
      /código no es correcto/,
    );
  });

  it('nunca muestra el texto técnico de un error desconocido', () => {
    expect(authErrorMessage(cognitoError('InternalErrorException'))).toBe(
      'No pudimos completar la operación. Inténtalo otra vez.',
    );
    expect(authErrorMessage('algo raro')).toMatch(/No pudimos/);
    expect(authErrorName('algo raro')).toBeUndefined();
  });
});

describe('esquemas de los formularios', () => {
  it('normaliza el correo', () => {
    expect(signInSchema.parse({ email: '  Ana@Correo.COM ', password: 'x' }).email).toBe(
      'ana@correo.com',
    );
  });

  it('pide la misma contraseña que el User Pool', () => {
    const base = { name: 'Ana', email: 'ana@correo.com' };
    expect(signUpSchema.safeParse({ ...base, password: 'Prueba1234' }).success).toBe(true);
    for (const password of ['Corta1', 'sinmayuscula1', 'SINMINUSCULA1', 'SinNumeros']) {
      expect(signUpSchema.safeParse({ ...base, password }).success).toBe(false);
    }
  });
});

describe('firstName', () => {
  it('usa el primer nombre o la parte antes de la @', () => {
    expect(firstName({ name: 'Ana María' })).toBe('Ana');
    expect(firstName({ name: 'ana@correo.com' })).toBe('ana');
  });
});
