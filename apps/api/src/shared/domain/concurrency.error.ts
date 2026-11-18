import { DomainError } from './domain-error.js';

/**
 * Dos peticiones modificaron el mismo agregado a la vez y la segunda
 * trabajaba con datos viejos (bloqueo optimista). Se responde 409 y el
 * cliente puede reintentar.
 */
export class ConcurrencyError extends DomainError {
  readonly code = 'CONCURRENT_MODIFICATION';
  readonly kind = 'conflict';
  constructor(aggregate: string, id: string) {
    super(`${aggregate} ${id} fue modificado por otra operación. Intenta de nuevo.`);
  }
}
