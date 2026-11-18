import type Stripe from 'stripe';
import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentGateway,
} from '../../application/payment.gateway.js';

/** La parte del SDK de Stripe que usamos. Tiparla así permite pasar un doble en los tests. */
export type StripeCheckoutClient = {
  checkout: { sessions: Pick<Stripe['checkout']['sessions'], 'create' | 'retrieve' | 'expire'> };
  refunds: Pick<Stripe['refunds'], 'create'>;
};

/**
 * ADAPTADOR: el puerto PaymentGateway implementado con Stripe Checkout.
 * Stripe aloja la página de pago: los datos de la tarjeta nunca pasan por
 * nuestros servidores (así no necesitamos certificación PCI).
 */
export class StripePaymentGateway implements PaymentGateway {
  constructor(private readonly stripe: StripeCheckoutClient) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      // El id del pedido viaja con la sesión y con el pago: el webhook (paso 20) lo usa
      // para saber qué pedido se pagó.
      client_reference_id: request.orderId,
      metadata: { orderId: request.orderId },
      payment_intent_data: { metadata: { orderId: request.orderId } },
      line_items: request.lines.map((line) => ({
        quantity: line.quantity,
        price_data: {
          currency: request.currency.toLowerCase(),
          unit_amount: line.unitPriceCents, // Stripe también trabaja en centavos
          product_data: { name: line.name },
        },
      })),
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      expires_at: Math.floor(request.expiresAt.getTime() / 1000), // Stripe usa segundos
    });
    return toCheckoutSession(session);
  }

  async findOpenCheckout(sessionId: string): Promise<CheckoutSession | null> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    return session.status === 'open' ? toCheckoutSession(session) : null;
  }

  async expireCheckout(sessionId: string): Promise<void> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    // Stripe solo deja expirar sesiones abiertas: si ya expiró o se pagó, no hay nada que hacer.
    if (session.status === 'open') await this.stripe.checkout.sessions.expire(sessionId);
  }

  async refundCheckout(sessionId: string): Promise<void> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    const paymentIntent =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntent) return; // la sesión nunca se pagó: no hay nada que devolver

    await this.stripe.refunds.create(
      { payment_intent: paymentIntent, metadata: { orderId: session.metadata?.orderId ?? '' } },
      // Clave de idempotencia: si reintentamos, Stripe devuelve el MISMO reembolso, no uno nuevo.
      { idempotencyKey: `refund-${sessionId}` },
    );
  }
}

function toCheckoutSession(session: Stripe.Checkout.Session): CheckoutSession {
  // Con mode "payment" (página alojada por Stripe), la URL siempre viene.
  if (!session.url) throw new Error(`Stripe no devolvió la URL de la sesión ${session.id}`);
  return { id: session.id, url: session.url };
}
