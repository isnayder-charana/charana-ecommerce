/**
 * Convierte los errores de Cognito (vienen en inglés, con un `name`) en
 * mensajes claros para la persona. Lo desconocido recibe un mensaje genérico:
 * nunca mostramos el texto técnico original.
 */
const MESSAGES: Record<string, string> = {
  // Correo inexistente y contraseña incorrecta dan el MISMO error a propósito
  // (prevent_user_existence_errors): así nadie puede averiguar quién tiene cuenta.
  NotAuthorizedException: 'Correo o contraseña incorrectos.',
  UserNotFoundException: 'Correo o contraseña incorrectos.',
  UsernameExistsException: 'Ya existe una cuenta con ese correo. Inicia sesión.',
  InvalidPasswordException:
    'La contraseña debe tener al menos 8 caracteres, con mayúscula, minúscula y número.',
  CodeMismatchException: 'El código no es correcto. Revísalo e inténtalo otra vez.',
  ExpiredCodeException: 'El código venció. Pide uno nuevo.',
  LimitExceededException: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  TooManyRequestsException: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  TooManyFailedAttemptsException: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  NetworkError: 'No hay conexión. Revisa tu internet e inténtalo otra vez.',
};

export function authErrorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}

export function authErrorMessage(error: unknown): string {
  const name = authErrorName(error);
  return (name && MESSAGES[name]) ?? 'No pudimos completar la operación. Inténtalo otra vez.';
}
