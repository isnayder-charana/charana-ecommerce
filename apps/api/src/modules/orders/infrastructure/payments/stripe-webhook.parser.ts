import Stripe from 'stripe';
import { InvalidPaymentEventError, type PaymentEvent } from '../../application/payment-event.js';
import { PaymentsNotConfiguredError } from '../../application/payment.gateway.js';

/** Los avisos de Stripe que nos importan y a qué los traducimos. */
const SESSION_EVENTS: Partial<Record<Stripe.Event['type'], PaymentEvent['type']>> = {
  'checkout.session.completed': 'payment_succeeded',
  // Métodos de pago que tardan (transferencias): el pago se confirma después.
  'checkout.session.async_payment_succeeded': 'payment_succeeded',
  'checkout.session.expired': 'checkout_expired',
};

/**
 * ADAPTADOR de entrada: verifica la firma de un webhook de Stripe y lo traduce
 * a un PaymentEvent. Devuelve null si es un aviso que no nos interesa.
 *
 * La firma (cabecera Stripe-Signature) es un HMAC-SHA256 del cuerpo EXACTO con
 * el secreto del webhook. Sin verificarla, cualquiera podría llamar a esta URL
 * y marcar pedidos como pagados.
 */
export class StripeWebhookParser {
  /** Sin secreto (STRIPE_WEBHOOK_SECRET) responde 503: no hay forma de verificar nada. */
  constructor(private readonly secret: string | undefined) {}

  parse(rawBody: Buffer, signature: string | undefined): PaymentEvent | null {
    if (!this.secret) throw new PaymentsNotConfiguredError();
    if (!signature) throw new InvalidPaymentEventError('falta la cabecera Stripe-Signature');

    let event: Stripe.Event;
    try {
      // También rechaza avisos con más de 5 minutos (evita que reenvíen uno viejo capturado).
      event = Stripe.webhooks.constructEvent(rawBody, signature, this.secret);
    } catch {
      throw new InvalidPaymentEventError('la firma no coincide');
    }

    const type = SESSION_EVENTS[event.type];
    if (!type) return null;

    const session = event.data.object as Stripe.Checkout.Session;
    // Pago con tarjeta: "paid" al instante. Con métodos lentos llega "unpaid" y esperamos al async.
    if (event.type === 'checkout.session.completed' && session.payment_status !== 'paid') {
      return null;
    }
    const orderId = session.metadata?.orderId ?? session.client_reference_id;
    if (!orderId) return null; // una sesión que no creamos nosotros (p. ej. `stripe trigger`)

    return { id: event.id, type, orderId, sessionId: session.id };
  }
}
