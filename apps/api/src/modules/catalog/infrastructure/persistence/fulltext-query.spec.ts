import { toFulltextQuery } from './prisma-product.repository.js';

describe('toFulltextQuery', () => {
  it.each([
    ['Cable USB-C', '+cable* +usb*'],
    ['  audífonos  ', '+audífonos*'],
    ['ssd 1tb', '+ssd* +1tb*'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(toFulltextQuery(input)).toBe(expected);
  });

  it.each([undefined, '', 'a b', '-* "+'])('sin palabras útiles (%p) → null', (input) => {
    expect(toFulltextQuery(input)).toBeNull();
  });
});
