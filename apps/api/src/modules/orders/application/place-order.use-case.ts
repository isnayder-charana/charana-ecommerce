import type { UseCase } from '../../../shared/application/use-case.js';
import { InvalidOrderError, Order } from '../domain/index.js';
import type { OrderRepository } from './order.repository.js';
import { type OrderView, toOrderView } from './order.view.js';
import type { StockGateway, StockRequest } from './stock.gateway.js';

export interface PlaceOrderInput {
  customerId: string;
  /** Correo verificado por Cognito (si la tienda lo envió). */
  customerEmail?: string | null;
  items: StockRequest[];
}

export class PlaceOrderUseCase implements UseCase<PlaceOrderInput, OrderView> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly stock: StockGateway,
    private readonly newId: () => string,
    private readonly clock: () => Date,
  ) {}

  async execute({ customerId, customerEmail, items }: PlaceOrderInput): Promise<OrderView> {
    if (items.length === 0) throw new InvalidOrderError('debe tener al menos un producto');

    // 1. Reservar stock (y obtener precio y nombre ACTUALES desde Catalog).
    const reserved = await this.stock.reserve(items);

    try {
      // 2. Crear el pedido: aquí el dominio valida cantidades, total, etc.
      const order = Order.place({
        id: this.newId(),
        customerId,
        customerEmail,
        lines: reserved,
        now: this.clock(),
      });
      await this.orders.save(order);
      return toOrderView(order);
    } catch (error) {
      // 3. Si algo falla después de reservar, devolvemos el stock (compensación).
      await this.stock.release(items);
      throw error;
    }
  }
}
