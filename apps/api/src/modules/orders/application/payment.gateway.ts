import { DomainError } from '../../../shared/domain/index.js';
import type { Currency } from '../../catalog/domain/money.js';

/** Lo que la pasarela necesita para cobrar un pedido. Los precios salen del pedido, nunca del navegador. */
export interface CheckoutRequest {
  orderId: string;
  currency: Currency;
  lines: { name: string; unitPriceCents: number; quantity: number }[];
  /** A dónde vuelve el cliente después de pagar o de arrepentirse. */
  successUrl: string;
  cancelUrl: string;
  /** Si no paga antes de esta hora, la sesión expira. */
  expiresAt: Date;
}

/** Una página de pago abierta en la pasarela. */
export interface CheckoutSession {
  id: string;
  url: string;
}

/**
 * PUERTO hacia la pasarela de pagos. Orders no sabe que existe Stripe:
 * en producción el adaptador es Stripe; en los tests, uno falso.
 */
export interface PaymentGateway {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** La sesión si todavía se puede pagar; null si expiró o ya se completó. */
  findOpenCheckout(sessionId: string): Promise<CheckoutSession | null>;
  /** Cierra una sesión abierta para que ya no se pueda pagar. No falla si ya estaba cerrada. */
  expireCheckout(sessionId: string): Promise<void>;
  /**
   * Devuelve el dinero de lo pagado en esa sesión. Idempotente: si se llama
   * dos veces para la misma sesión, la pasarela hace UN solo reembolso.
   */
  refundCheckout(sessionId: string): Promise<void>;
}

export const PAYMENT_GATEWAY = Symbol('PaymentGateway');

/** No hay clave de Stripe configurada (STRIPE_SECRET_KEY): la API responde 503. */
export class PaymentsNotConfiguredError extends DomainError {
  readonly code = 'PAYMENTS_NOT_CONFIGURED';
  readonly kind = 'unavailable';
  constructor() {
    super('Los pagos no están configurados en este servidor');
  }
}
