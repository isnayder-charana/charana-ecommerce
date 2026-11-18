import { AggregateRoot } from '../../../shared/domain/index.js';
import { type Currency, Money } from './money.js';
import { InsufficientStockError, InvalidProductError } from './product.errors.js';
import { Sku } from './sku.js';

export const CATEGORIES = [
  'audio',
  'cargadores',
  'cables',
  'perifericos',
  'fundas',
  'almacenamiento',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Forma "plana" del producto: la usan la base de datos y las respuestas HTTP. */
export interface ProductPrimitives {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: Category;
  priceCents: number;
  currency: Currency;
  stock: number;
  imageUrl: string | null;
  /**
   * Versión para el bloqueo optimista. 0 = producto nuevo, aún no guardado.
   * El repositorio la incrementa en cada escritura.
   */
  version: number;
}

export type NewProduct = Omit<ProductPrimitives, 'imageUrl' | 'version'> & {
  imageUrl?: string | null;
};

export class Product extends AggregateRoot<string> {
  private constructor(
    id: string,
    readonly sku: Sku,
    readonly name: string,
    readonly description: string,
    readonly category: Category,
    private _price: Money,
    private _stock: number,
    readonly imageUrl: string | null,
    readonly version: number,
  ) {
    super(id);
  }

  /** Crea un producto nuevo validando todas las reglas de negocio. */
  static create(input: NewProduct): Product {
    const name = input.name.trim();
    if (name.length < 3)
      throw new InvalidProductError('el nombre debe tener al menos 3 caracteres');
    if (!CATEGORIES.includes(input.category)) {
      throw new InvalidProductError(`la categoría ${input.category} no existe`);
    }
    if (!Number.isInteger(input.stock) || input.stock < 0) {
      throw new InvalidProductError('el stock debe ser un entero mayor o igual a 0');
    }

    return new Product(
      input.id,
      Sku.of(input.sku),
      name,
      input.description.trim(),
      input.category,
      Money.of(input.priceCents, input.currency),
      input.stock,
      input.imageUrl ?? null,
      0,
    );
  }

  /** Reconstruye un producto ya guardado (sus datos se validaron al crearlo). */
  static fromPrimitives(p: ProductPrimitives): Product {
    return new Product(
      p.id,
      Sku.of(p.sku),
      p.name,
      p.description,
      p.category,
      Money.of(p.priceCents, p.currency),
      p.stock,
      p.imageUrl,
      p.version,
    );
  }

  get price(): Money {
    return this._price;
  }

  get stock(): number {
    return this._stock;
  }

  get inStock(): boolean {
    return this._stock > 0;
  }

  changePrice(cents: number): void {
    this._price = Money.of(cents, this._price.currency);
  }

  /** Descuenta stock al confirmar un pedido. Regla: nunca puede quedar negativo. */
  reserveStock(quantity: number): void {
    Product.assertPositiveQuantity(quantity);
    if (quantity > this._stock) {
      throw new InsufficientStockError(this.sku.value, quantity, this._stock);
    }
    this._stock -= quantity;
    this.addEvent({ name: 'catalog.StockReserved', occurredAt: new Date() });
  }

  /** Devuelve stock (p. ej. si el pago falla o se cancela el pedido). */
  releaseStock(quantity: number): void {
    Product.assertPositiveQuantity(quantity);
    this._stock += quantity;
  }

  toPrimitives(): ProductPrimitives {
    return {
      id: this.id,
      sku: this.sku.value,
      name: this.name,
      description: this.description,
      category: this.category,
      priceCents: this._price.cents,
      currency: this._price.currency,
      stock: this._stock,
      imageUrl: this.imageUrl,
      version: this.version,
    };
  }

  private static assertPositiveQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InvalidProductError('la cantidad debe ser un entero mayor a 0');
    }
  }
}
