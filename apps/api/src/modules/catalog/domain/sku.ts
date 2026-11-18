import { DomainError, ValueObject } from '../../../shared/domain/index.js';

export class InvalidSkuError extends DomainError {
  readonly code = 'INVALID_SKU';
  readonly kind = 'validation';
  constructor(value: string) {
    super(`SKU inválido: "${value}". Formato esperado: AAA-BBB-001`);
  }
}

const SKU_PATTERN = /^[A-Z0-9]{2,5}(-[A-Z0-9]{2,5}){1,3}$/;

/** Código de inventario (Stock Keeping Unit), p. ej. "CT-AUD-001". */
export class Sku extends ValueObject<{ value: string }> {
  static of(raw: string): Sku {
    const value = raw.trim().toUpperCase();
    if (!SKU_PATTERN.test(value)) throw new InvalidSkuError(raw);
    return new Sku({ value });
  }

  get value(): string {
    return this.props.value;
  }
}
