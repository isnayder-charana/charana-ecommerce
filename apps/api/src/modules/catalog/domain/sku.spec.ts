import { InvalidSkuError, Sku } from './sku.js';

describe('Sku', () => {
  it('normaliza a mayúsculas y quita espacios', () => {
    expect(Sku.of('  ct-aud-001 ').value).toBe('CT-AUD-001');
  });

  it.each(['', 'CT', 'CT_AUD_001', 'CT-AUD-001-X-Y'])('rechaza "%s"', (raw) => {
    expect(() => Sku.of(raw)).toThrow(InvalidSkuError);
  });
});
