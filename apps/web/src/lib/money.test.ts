import { describe, expect, it } from 'vitest';
import { discountPercent, formatMoney } from './money';

describe('formatMoney', () => {
  // Intl separa el símbolo con un espacio "duro" (\u00a0) para que nunca quede solo en otra línea.
  it('convierte centavos a texto con el símbolo de la moneda', () => {
    expect(formatMoney(5999, 'USD')).toBe('$\u00a059.99');
    expect(formatMoney(100000, 'USD')).toBe('$\u00a01,000.00');
  });
});

describe('discountPercent', () => {
  it('calcula el descuento redondeado', () => {
    expect(discountPercent(3499, 4999)).toBe(30);
    expect(discountPercent(5999, 7499)).toBe(20);
  });
});
