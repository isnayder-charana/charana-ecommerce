import { DomainError } from '../../../shared/domain/index.js';
import type { OrderStatus } from './order-status.js';

export class InvalidOrderError extends DomainError {
  readonly code = 'INVALID_ORDER';
  readonly kind = 'validation';
  constructor(reason: string) {
    super(`Pedido inválido: ${reason}`);
  }
}

export class OrderNotFoundError extends DomainError {
  readonly code = 'ORDER_NOT_FOUND';
  readonly kind = 'not_found';
  constructor(id: string) {
    super(`No existe el pedido ${id}`);
  }
}

export class InvalidOrderTransitionError extends DomainError {
  readonly code = 'INVALID_ORDER_TRANSITION';
  readonly kind = 'conflict';
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Un pedido ${from} no puede pasar a ${to}`);
  }
}

export class OrderNotPayableError extends DomainError {
  readonly code = 'ORDER_NOT_PAYABLE';
  readonly kind = 'conflict';
  constructor(id: string, status: OrderStatus) {
    super(`El pedido ${id} no se puede pagar: está ${status}`);
  }
}
