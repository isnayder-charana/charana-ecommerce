import { ValueObject } from '../../../shared/domain/index.js';
import { type Currency, Money } from '../../catalog/domain/money.js';
import { InvalidOrderError } from './order.errors.js';

export const MAX_QUANTITY_PER_LINE = 10;

export interface OrderLinePrimitives {
  productId: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  currency: Currency;
  quantity: number;
}

/**
 * Una línea del pedido. Guarda una COPIA del nombre y del precio al momento
 * de comprar: si mañana el producto sube de precio, el pedido no cambia.
 */
export class OrderLine extends ValueObject<{
  productId: string;
  sku: string;
  name: string;
  unitPrice: Money;
  quantity: number;
}> {
  static create(p: OrderLinePrimitives): OrderLine {
    if (!Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > MAX_QUANTITY_PER_LINE) {
      throw new InvalidOrderError(
        `la cantidad de ${p.sku} debe ser un entero entre 1 y ${MAX_QUANTITY_PER_LINE}`,
      );
    }
    return new OrderLine({
      productId: p.productId,
      sku: p.sku,
      name: p.name,
      unitPrice: Money.of(p.unitPriceCents, p.currency),
      quantity: p.quantity,
    });
  }

  get productId(): string {
    return this.props.productId;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get subtotal(): Money {
    return this.props.unitPrice.multiply(this.props.quantity);
  }

  toPrimitives(): OrderLinePrimitives {
    return {
      productId: this.props.productId,
      sku: this.props.sku,
      name: this.props.name,
      unitPriceCents: this.props.unitPrice.cents,
      currency: this.props.unitPrice.currency,
      quantity: this.props.quantity,
    };
  }
}
