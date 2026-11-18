import { AggregateRoot } from '../../../shared/domain/index.js';
import { type Currency, Money } from '../../catalog/domain/money.js';
import { OrderLine, type OrderLinePrimitives } from './order-line.js';
import {
  InvalidOrderError,
  InvalidOrderTransitionError,
  OrderNotPayableError,
} from './order.errors.js';
import { ALLOWED_TRANSITIONS, type OrderStatus } from './order-status.js';

export const MAX_LINES_PER_ORDER = 20;

/** Validación básica de forma; quien garantiza que el correo es de la persona es Cognito. */
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export interface StatusChange {
  status: OrderStatus;
  at: string; // ISO 8601
}

export interface OrderPrimitives {
  id: string;
  customerId: string;
  status: OrderStatus;
  lines: OrderLinePrimitives[];
  totalCents: number;
  currency: Currency;
  history: StatusChange[];
  createdAt: string;
  /**
   * Sesión de pago abierta en la pasarela (Stripe Checkout), si la hay.
   * Opcional porque los pedidos guardados antes de la fase 3 no la tienen.
   */
  paymentSessionId?: string | null;
  /**
   * Correo al que avisamos los cambios del pedido (paso 24). Es una "foto" del
   * momento de la compra, como el precio. Opcional: los pedidos anteriores no lo tienen.
   */
  customerEmail?: string | null;
  /**
   * Versión para el bloqueo optimista. 0 = pedido nuevo, aún no guardado.
   * El repositorio la incrementa en cada escritura.
   */
  version: number;
}

/**
 * Agregado Order: el pedido y sus líneas cambian JUNTOS y siempre a través
 * de esta clase. Así es imposible, por ejemplo, tener un total que no
 * coincida con las líneas o un pedido entregado que nunca se pagó.
 */
export class Order extends AggregateRoot<string> {
  private constructor(
    id: string,
    readonly customerId: string,
    private _status: OrderStatus,
    private readonly _lines: readonly OrderLine[],
    readonly total: Money,
    private readonly _history: StatusChange[],
    readonly createdAt: Date,
    readonly version: number,
    private _paymentSessionId: string | null,
    readonly customerEmail: string | null,
  ) {
    super(id);
  }

  static place(input: {
    id: string;
    customerId: string;
    customerEmail?: string | null;
    lines: OrderLinePrimitives[];
    now: Date;
  }): Order {
    if (input.lines.length === 0) throw new InvalidOrderError('debe tener al menos un producto');
    if (input.lines.length > MAX_LINES_PER_ORDER) {
      throw new InvalidOrderError(`máximo ${MAX_LINES_PER_ORDER} productos distintos`);
    }

    const ids = input.lines.map((l) => l.productId);
    if (new Set(ids).size !== ids.length) {
      throw new InvalidOrderError('un producto no puede repetirse en dos líneas');
    }

    const email = input.customerEmail?.trim().toLowerCase() || null;
    if (email !== null && !EMAIL.test(email)) throw new InvalidOrderError('correo inválido');

    const lines = input.lines.map((l) => OrderLine.create(l));
    // Money.add lanza error si las monedas no coinciden.
    const total = lines.map((l) => l.subtotal).reduce((sum, subtotal) => sum.add(subtotal));

    const order = new Order(
      input.id,
      input.customerId,
      'PENDING_PAYMENT',
      lines,
      total,
      [{ status: 'PENDING_PAYMENT', at: input.now.toISOString() }],
      input.now,
      0,
      null,
      email,
    );
    order.addEvent({ name: 'orders.OrderPlaced', occurredAt: input.now });
    return order;
  }

  static fromPrimitives(p: OrderPrimitives): Order {
    return new Order(
      p.id,
      p.customerId,
      p.status,
      p.lines.map((l) => OrderLine.create(l)),
      Money.of(p.totalCents, p.currency),
      [...p.history],
      new Date(p.createdAt),
      p.version,
      p.paymentSessionId ?? null,
      p.customerEmail ?? null,
    );
  }

  get status(): OrderStatus {
    return this._status;
  }

  get lines(): readonly OrderLine[] {
    return this._lines;
  }

  get history(): readonly StatusChange[] {
    return this._history;
  }

  get paymentSessionId(): string | null {
    return this._paymentSessionId;
  }

  /** Solo se paga un pedido pendiente de pago (no uno cancelado ni uno ya pagado). */
  get isPayable(): boolean {
    return this._status === 'PENDING_PAYMENT';
  }

  /**
   * Recuerda la sesión de pago abierta para este pedido. Así, si el cliente
   * vuelve a hacer clic en "Pagar", reutilizamos la misma sesión en vez de
   * abrir otra (y arriesgarnos a que pague dos veces).
   */
  attachPaymentSession(sessionId: string): void {
    if (!this.isPayable) throw new OrderNotPayableError(this.id, this._status);
    this._paymentSessionId = sessionId;
  }

  isOwnedBy(customerId: string): boolean {
    return this.customerId === customerId;
  }

  markPaid(now: Date): void {
    this.transitionTo('PAID', now);
  }

  ship(now: Date): void {
    this.transitionTo('SHIPPED', now);
  }

  deliver(now: Date): void {
    this.transitionTo('DELIVERED', now);
  }

  cancel(now: Date): void {
    this.transitionTo('CANCELLED', now);
  }

  toPrimitives(): OrderPrimitives {
    return {
      id: this.id,
      customerId: this.customerId,
      status: this._status,
      lines: this._lines.map((l) => l.toPrimitives()),
      totalCents: this.total.cents,
      currency: this.total.currency,
      history: [...this._history],
      createdAt: this.createdAt.toISOString(),
      paymentSessionId: this._paymentSessionId,
      customerEmail: this.customerEmail,
      version: this.version,
    };
  }

  private transitionTo(next: OrderStatus, now: Date): void {
    if (!ALLOWED_TRANSITIONS[this._status].includes(next)) {
      throw new InvalidOrderTransitionError(this._status, next);
    }
    this._status = next;
    this._history.push({ status: next, at: now.toISOString() });
    this.addEvent({ name: `orders.Order${pascal(next)}`, occurredAt: now });
  }
}

function pascal(status: OrderStatus): string {
  return status
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}
