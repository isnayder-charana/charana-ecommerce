import { ValueObject } from './value-object.js';

class Money extends ValueObject<{ amount: number; currency: string }> {
  static of(amount: number, currency: string): Money {
    return new Money({ amount, currency });
  }
}

class Sku extends ValueObject<{ amount: number; currency: string }> {
  static of(amount: number, currency: string): Sku {
    return new Sku({ amount, currency });
  }
}

describe('ValueObject', () => {
  it('es igual a otro con los mismos atributos', () => {
    expect(Money.of(10, 'USD').equals(Money.of(10, 'USD'))).toBe(true);
  });

  it('es distinto si cambia algún atributo', () => {
    expect(Money.of(10, 'USD').equals(Money.of(10, 'PEN'))).toBe(false);
  });

  it('es distinto de otra clase aunque tenga los mismos atributos', () => {
    expect(Money.of(10, 'USD').equals(Sku.of(10, 'USD'))).toBe(false);
  });

  it('es distinto de undefined', () => {
    expect(Money.of(10, 'USD').equals(undefined)).toBe(false);
  });
});
