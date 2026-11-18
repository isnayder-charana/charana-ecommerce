import { InvalidMoneyError, Money } from './money.js';

describe('Money', () => {
  it('guarda el monto en centavos', () => {
    const price = Money.of(5999, 'USD');
    expect(price.cents).toBe(5999);
    expect(price.currency).toBe('USD');
  });

  it.each([
    [10.5, 'debe ser un entero'],
    [-1, 'no puede ser negativo'],
  ])('rechaza %p (%s)', (cents, reason) => {
    expect(() => Money.of(cents, 'USD')).toThrow(reason);
  });

  it('rechaza monedas no soportadas', () => {
    expect(() => Money.of(100, 'EUR' as 'USD')).toThrow(InvalidMoneyError);
  });

  it('multiplica y suma sin errores de coma flotante', () => {
    const total = Money.of(10, 'USD').add(Money.of(20, 'USD')).multiply(3);
    expect(total.equals(Money.of(90, 'USD'))).toBe(true);
  });

  it('no suma monedas distintas', () => {
    expect(() => Money.of(10, 'USD').add(Money.of(10, 'PEN'))).toThrow('monedas distintas');
  });
});
