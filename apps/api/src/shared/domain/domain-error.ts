/**
 * Error de negocio. Lo lanza el dominio cuando se rompe una regla
 * (p. ej. "stock insuficiente"). No sabe nada de HTTP: la capa de
 * infraestructura decide a qué código HTTP se traduce.
 */
export type DomainErrorKind = 'validation' | 'not_found' | 'conflict' | 'unavailable';

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
