import Stripe from 'stripe';
import { InvalidPaymentEventError } from '../../application/payment-event.js';
import { PaymentsNotConfiguredError } from '../../application/payment.gateway.js';
import { StripeWebhookParser } from './stripe-webhook.parser.js';

const secret = 'whsec_test123';

/** Arma un aviso firmado igual que lo firma Stripe (HMAC-SHA256 con el secreto). */
function signed(type: string, session: Record<string, unknown>, signWith = secret) {
  const payload = JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type,
    data: { object: { id: 'cs_1', object: 'checkout.session', ...session } },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: signWith });
  return [Buffer.from(payload), signature] as const;
}

const parser = new StripeWebhookParser(secret);
const paid = { payment_status: 'paid', metadata: { orderId: 'o-1' } };

describe('StripeWebhookParser', () => {
  it('traduce un checkout pagado a payment_succeeded', () => {
    expect(parser.parse(...signed('checkout.session.completed', paid))).toEqual({
      id: 'evt_1',
      type: 'payment_succeeded',
      orderId: 'o-1',
      sessionId: 'cs_1',
    });
  });

  it('traduce la expiración y el pago diferido, y usa client_reference_id si no hay metadata', () => {
    expect(
      parser.parse(...signed('checkout.session.expired', { client_reference_id: 'o-2' })),
    ).toMatchObject({ type: 'checkout_expired', orderId: 'o-2' });
    expect(parser.parse(...signed('checkout.session.async_payment_succeeded', paid))).toMatchObject(
      { type: 'payment_succeeded' },
    );
  });

  it('ignora avisos que no nos interesan o sin pedido', () => {
    expect(parser.parse(...signed('customer.created', {}))).toBeNull();
    expect(
      parser.parse(...signed('checkout.session.completed', { ...paid, payment_status: 'unpaid' })),
    ).toBeNull();
    expect(
      parser.parse(...signed('checkout.session.completed', { payment_status: 'paid' })),
    ).toBeNull();
  });

  it('rechaza avisos sin firma o firmados con otro secreto', () => {
    const [body] = signed('checkout.session.completed', paid);
    expect(() => parser.parse(body, undefined)).toThrow(InvalidPaymentEventError);
    expect(() => parser.parse(...signed('checkout.session.completed', paid, 'whsec_otro'))).toThrow(
      'la firma no coincide',
    );
  });

  it('rechaza un cuerpo modificado después de firmarlo', () => {
    const [body, signature] = signed('checkout.session.completed', paid);
    const tampered = Buffer.from(body.toString().replace('o-1', 'o-9'));
    expect(() => parser.parse(tampered, signature)).toThrow(InvalidPaymentEventError);
  });

  it('sin secreto configurado responde que los pagos no están disponibles', () => {
    expect(() =>
      new StripeWebhookParser(undefined).parse(...signed('checkout.session.completed', paid)),
    ).toThrow(PaymentsNotConfiguredError);
  });
});
