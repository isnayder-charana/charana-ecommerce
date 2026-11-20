import { PRODUCT_SEED, productImageUrl } from './product.seed.js';

describe('Fotos de los productos de ejemplo', () => {
  it('la foto se llama como el SKU en minúsculas, bajo la URL base', () => {
    expect(productImageUrl('CT-AUD-001', 'https://d123.cloudfront.net/products')).toBe(
      'https://d123.cloudfront.net/products/ct-aud-001.jpg',
    );
    expect(productImageUrl('CT-AUD-001', 'http://localhost:3001/products/')).toBe(
      'http://localhost:3001/products/ct-aud-001.jpg',
    );
  });

  it('sin URL base, el producto queda sin foto', () => {
    expect(productImageUrl('CT-AUD-001', undefined)).toBeNull();
    expect(productImageUrl('CT-AUD-001', '')).toBeNull();
  });

  it('los SKU de la semilla no se repiten (cada uno tiene su archivo)', () => {
    const skus = PRODUCT_SEED.map((p) => p.sku.toLowerCase());
    expect(new Set(skus).size).toBe(skus.length);
  });
});
