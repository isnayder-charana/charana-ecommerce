import { DomainError, ValueObject } from '../../../shared/domain/index.js';

export const CURRENCIES = ['USD', 'PEN'] as const;
export type Currency = (typeof CURRENCIES)[number];

export class InvalidMoneyError extends DomainError {
  readonly code = 'INVALID_MONEY';
  readonly kind = 'validation';
  constructor(reason: string) {
    super(`Monto inválido: ${reason}`);
  }
}

/**
 * Dinero en **centavos** (entero) para evitar errores de coma flotante:
 * 0.1 + 0.2 = 0.30000000000000004 en JavaScript, pero 10 + 20 = 30 siempre.
 */
export class Money extends ValueObject<{ cents: number; currency: Currency }> {
  static of(cents: number, currency: Currency): Money {
    if (!Number.isInteger(cents)) throw new InvalidMoneyError('debe ser un entero en centavos');
    if (cents < 0) throw new InvalidMoneyError('no puede ser negativo');
    if (!CURRENCIES.includes(currency))
      throw new InvalidMoneyError(`moneda ${currency} no soportada`);
    return new Money({ cents, currency });
  }

  get cents(): number {
    return this.props.cents;
  }

  get currency(): Currency {
    return this.props.currency;
  }

  multiply(factor: number): Money {
    return Money.of(this.cents * factor, this.currency);
  }

  add(other: Money): Money {
    if (other.currency !== this.currency)
      throw new InvalidMoneyError('no se pueden sumar monedas distintas');
    return Money.of(this.cents + other.cents, this.currency);
  }
}
