import { DomainError } from '../../../shared/domain/index.js';

/**
 * Un aviso de la pasarela de pagos, ya verificado y traducido a nuestro idioma.
 * El caso de uso no sabe que viene de un webhook de Stripe.
 */
export interface PaymentEvent {
  /** Id único del aviso en la pasarela: sirve para no procesarlo dos veces. */
  id: string;
  type: 'payment_succeeded' | 'checkout_expired';
  orderId: string;
  sessionId: string;
}

/**
 * PUERTO: recuerda qué avisos ya se procesaron (idempotencia).
 * La pasarela puede reenviar el mismo aviso varias veces.
 */
export interface ProcessedEventStore {
  has(eventId: string): Promise<boolean>;
  record(eventId: string): Promise<void>;
}

export const PROCESSED_EVENT_STORE = Symbol('ProcessedEventStore');

/** La firma del aviso no coincide: no viene de la pasarela o fue modificado (HTTP 400). */
export class InvalidPaymentEventError extends DomainError {
  readonly code = 'INVALID_PAYMENT_EVENT';
  readonly kind = 'validation';
  constructor(reason: string) {
    super(`Aviso de pago inválido: ${reason}`);
  }
}
