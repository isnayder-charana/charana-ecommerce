import { DomainError } from '../../../shared/domain/index.js';

export class InvalidProductError extends DomainError {
  readonly code = 'INVALID_PRODUCT';
  readonly kind = 'validation';
  constructor(reason: string) {
    super(`Producto inválido: ${reason}`);
  }
}

export class ProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly kind = 'not_found';
  constructor(id: string) {
    super(`No existe el producto ${id}`);
  }
}

export class SkuAlreadyExistsError extends DomainError {
  readonly code = 'SKU_ALREADY_EXISTS';
  readonly kind = 'conflict';
  constructor(sku: string) {
    super(`Ya existe un producto con el SKU ${sku}`);
  }
}

export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK';
  readonly kind = 'conflict';
  constructor(sku: string, requested: number, available: number) {
    super(`Stock insuficiente para ${sku}: pediste ${requested}, quedan ${available}`);
  }
}
