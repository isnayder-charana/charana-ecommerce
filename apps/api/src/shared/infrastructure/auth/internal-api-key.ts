import { createHash, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { DomainError } from '../../domain/domain-error.js';

export class InternalApiNotConfiguredError extends DomainError {
  readonly code = 'INTERNAL_API_NOT_CONFIGURED';
  readonly kind = 'unavailable';
  constructor() {
    super('La API interna no está configurada en este servidor');
  }
}

/**
 * Clave compartida entre la API y los workers (servicio a servicio, sin persona
 * detrás, así que no hay token de Cognito). Viaja en la cabecera X-Internal-Key.
 *
 * La comparación es de tiempo constante: con un `===` normal, medir cuánto tarda
 * la respuesta podría revelar cuántos caracteres del inicio acertó un atacante.
 */
export class InternalApiKey {
  constructor(private readonly expected?: string) {}

  /** 503 si el servidor no tiene clave configurada; 401 si no coincide. */
  verify(received: string | undefined): void {
    if (!this.expected) throw new InternalApiNotConfiguredError();
    if (!received || !sameSecret(received, this.expected)) {
      throw new UnauthorizedException('Clave interna inválida');
    }
  }
}

function sameSecret(a: string, b: string): boolean {
  // timingSafeEqual exige el mismo largo: comparamos los hash (siempre 32 bytes).
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}
