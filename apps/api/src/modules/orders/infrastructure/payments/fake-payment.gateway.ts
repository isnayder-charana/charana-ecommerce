import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentGateway,
} from '../../application/payment.gateway.js';

/** Pasarela falsa para tests: guarda lo que le pidieron y permite cerrar sesiones. */
export class FakePaymentGateway implements PaymentGateway {
  readonly requests: CheckoutRequest[] = [];
  readonly expired: string[] = [];
  /** Sesiones reembolsadas: un Set, porque el reembolso es idempotente por sesión. */
  readonly refunded = new Set<string>();
  private readonly open = new Map<string, CheckoutSession>();

  createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    this.requests.push(request);
    const id = `cs_test_${this.requests.length}`;
    const session = { id, url: `https://checkout.stripe.test/${id}` };
    this.open.set(id, session);
    return Promise.resolve(session);
  }

  findOpenCheckout(sessionId: string): Promise<CheckoutSession | null> {
    return Promise.resolve(this.open.get(sessionId) ?? null);
  }

  expireCheckout(sessionId: string): Promise<void> {
    if (this.open.delete(sessionId)) this.expired.push(sessionId);
    return Promise.resolve();
  }

  refundCheckout(sessionId: string): Promise<void> {
    this.refunded.add(sessionId);
    return Promise.resolve();
  }

  /** Simula que la sesión expiró o ya se pagó. */
  close(sessionId: string): void {
    this.open.delete(sessionId);
  }
}
