import { describe, expect, it } from 'vitest';
import {
  addLine,
  type CartLine,
  cartSchema,
  countItems,
  MAX_QUANTITY,
  setLineQuantity,
} from './cart';

const A = '7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1001';
const B = '7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1002';

describe('carrito', () => {
  it('agrega un producto nuevo', () => {
    expect(addLine([], A, 2)).toEqual([{ productId: A, quantity: 2 }]);
  });

  it('suma la cantidad si el producto ya estaba', () => {
    const lines: CartLine[] = [{ productId: A, quantity: 2 }];
    expect(addLine(lines, A, 3)).toEqual([{ productId: A, quantity: 5 }]);
  });

  it('nunca pasa del máximo por producto', () => {
    expect(addLine([{ productId: A, quantity: 8 }], A, 5)[0]?.quantity).toBe(MAX_QUANTITY);
    expect(addLine([], A, 50)[0]?.quantity).toBe(MAX_QUANTITY);
  });

  it('no modifica el arreglo original (funciones puras)', () => {
    const lines: CartLine[] = [{ productId: A, quantity: 1 }];
    addLine(lines, A, 1);
    expect(lines).toEqual([{ productId: A, quantity: 1 }]);
  });

  it('cambia la cantidad y con 0 quita el producto', () => {
    const lines: CartLine[] = [
      { productId: A, quantity: 1 },
      { productId: B, quantity: 1 },
    ];
    expect(setLineQuantity(lines, A, 4)).toEqual([
      { productId: A, quantity: 4 },
      { productId: B, quantity: 1 },
    ]);
    expect(setLineQuantity(lines, A, 0)).toEqual([{ productId: B, quantity: 1 }]);
  });

  it('cuenta unidades, no líneas', () => {
    expect(
      countItems([
        { productId: A, quantity: 2 },
        { productId: B, quantity: 1 },
      ]),
    ).toBe(3);
  });

  it('rechaza una cookie manipulada', () => {
    expect(cartSchema.safeParse([{ productId: A, quantity: 2 }]).success).toBe(true);
    expect(cartSchema.safeParse([{ productId: 'abc', quantity: 2 }]).success).toBe(false);
    expect(cartSchema.safeParse([{ productId: A, quantity: 999 }]).success).toBe(false);
    expect(cartSchema.safeParse([{ productId: A, quantity: 1, price: 1 }]).data).toEqual([
      { productId: A, quantity: 1 }, // los campos extra (como un precio inventado) se descartan
    ]);
  });
});
