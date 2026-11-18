import { InsufficientStockError, InvalidProductError } from './product.errors.js';
import { type NewProduct, Product } from './product.js';

const valid: NewProduct = {
  id: 'p-1',
  sku: 'CT-AUD-001',
  name: '  Audífonos Pulse ',
  description: 'Bluetooth',
  category: 'audio',
  priceCents: 5999,
  currency: 'USD',
  stock: 5,
};

describe('Product', () => {
  it('se crea con datos válidos y limpia el nombre', () => {
    const product = Product.create(valid);
    expect(product.name).toBe('Audífonos Pulse');
    expect(product.imageUrl).toBeNull();
    expect(product.inStock).toBe(true);
  });

  it.each<[string, Partial<NewProduct>]>([
    ['nombre corto', { name: 'ab' }],
    ['categoría inexistente', { category: 'juguetes' as NewProduct['category'] }],
    ['stock negativo', { stock: -1 }],
    ['stock decimal', { stock: 1.5 }],
  ])('rechaza %s', (_, override) => {
    expect(() => Product.create({ ...valid, ...override })).toThrow(InvalidProductError);
  });

  it('reserva stock y registra un evento', () => {
    const product = Product.create(valid);
    product.reserveStock(5);
    expect(product.stock).toBe(0);
    expect(product.inStock).toBe(false);
    expect(product.pullEvents().map((e) => e.name)).toEqual(['catalog.StockReserved']);
  });

  it('no permite reservar más stock del disponible', () => {
    const product = Product.create(valid);
    expect(() => product.reserveStock(6)).toThrow(InsufficientStockError);
    expect(product.stock).toBe(5);
  });

  it('exige cantidades enteras positivas', () => {
    const product = Product.create(valid);
    expect(() => product.reserveStock(0)).toThrow(InvalidProductError);
    expect(() => product.releaseStock(-2)).toThrow(InvalidProductError);
  });

  it('devuelve stock y cambia el precio', () => {
    const product = Product.create(valid);
    product.releaseStock(3);
    product.changePrice(4999);
    expect(product.toPrimitives()).toMatchObject({ stock: 8, priceCents: 4999, sku: 'CT-AUD-001' });
  });

  it('se reconstruye igual desde sus primitivos', () => {
    const product = Product.create({ ...valid, imageUrl: 'https://cdn.example.com/a.webp' });
    const copy = Product.fromPrimitives(product.toPrimitives());
    expect(copy.toPrimitives()).toEqual(product.toPrimitives());
    expect(copy.equals(product)).toBe(true);
  });
});
