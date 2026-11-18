import type Stripe from 'stripe';
import { type StripeCheckoutClient, StripePaymentGateway } from './stripe-payment.gateway.js';

/** Un doble del SDK: probamos qué le pedimos a Stripe sin salir a internet. */
function fakeStripe(session: Partial<Stripe.Checkout.Session>) {
  const calls = {
    create: [] as unknown[],
    retrieve: [] as unknown[],
    expire: [] as unknown[],
    refund: [] as unknown[],
  };
  const refunds = {
    create: async (...args: unknown[]) => {
      calls.refund.push(args);
      return {};
    },
  };
  const sessions = {
    expire: async (id: string) => {
      calls.expire.push(id);
      return session;
    },
    create: async (params: unknown) => {
      calls.create.push(params);
      return session;
    },
    retrieve: async (id: string) => {
      calls.retrieve.push(id);
      return session;
    },
  };
  const client = { checkout: { sessions }, refunds } as unknown as StripeCheckoutClient;
  return { client, calls };
}

const request = {
  orderId: 'o-1',
  currency: 'USD' as const,
  lines: [{ name: 'Audífonos', unitPriceCents: 5999, quantity: 2 }],
  successUrl: 'https://tienda.test/pedidos/o-1?pago=exito',
  cancelUrl: 'https://tienda.test/pedidos/o-1?pago=cancelado',
  expiresAt: new Date('2026-11-15T12:30:00.500Z'),
};

describe('StripePaymentGateway', () => {
  it('crea una sesión de Checkout con los precios en centavos y el id del pedido', async () => {
    const { client, calls } = fakeStripe({ id: 'cs_1', url: 'https://checkout.stripe.com/c/1' });

    await expect(new StripePaymentGateway(client).createCheckout(request)).resolves.toEqual({
      id: 'cs_1',
      url: 'https://checkout.stripe.com/c/1',
    });
    expect(calls.create).toEqual([
      {
        mode: 'payment',
        client_reference_id: 'o-1',
        metadata: { orderId: 'o-1' },
        payment_intent_data: { metadata: { orderId: 'o-1' } },
        line_items: [
          {
            quantity: 2,
            price_data: { currency: 'usd', unit_amount: 5999, product_data: { name: 'Audífonos' } },
          },
        ],
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        expires_at: Math.floor(Date.parse('2026-11-15T12:30:00Z') / 1000),
      },
    ]);
  });

  it('solo devuelve sesiones que todavía se pueden pagar', async () => {
    const open = fakeStripe({ id: 'cs_1', url: 'https://x', status: 'open' });
    await expect(new StripePaymentGateway(open.client).findOpenCheckout('cs_1')).resolves.toEqual({
      id: 'cs_1',
      url: 'https://x',
    });
    expect(open.calls.retrieve).toEqual(['cs_1']);

    const expired = fakeStripe({ id: 'cs_1', url: null, status: 'expired' });
    await expect(
      new StripePaymentGateway(expired.client).findOpenCheckout('cs_1'),
    ).resolves.toBeNull();
  });

  it('falla claro si Stripe no devuelve la URL', async () => {
    const { client } = fakeStripe({ id: 'cs_1', url: null });
    await expect(new StripePaymentGateway(client).createCheckout(request)).rejects.toThrow(
      'no devolvió la URL',
    );
  });

  it('expira solo sesiones abiertas', async () => {
    const open = fakeStripe({ id: 'cs_1', status: 'open' });
    await new StripePaymentGateway(open.client).expireCheckout('cs_1');
    expect(open.calls.expire).toEqual(['cs_1']);

    const complete = fakeStripe({ id: 'cs_1', status: 'complete' });
    await new StripePaymentGateway(complete.client).expireCheckout('cs_1');
    expect(complete.calls.expire).toEqual([]);
  });

  it('reembolsa el pago de la sesión con una clave de idempotencia', async () => {
    const { client, calls } = fakeStripe({
      id: 'cs_1',
      payment_intent: 'pi_1',
      metadata: { orderId: 'o-1' },
    });
    await new StripePaymentGateway(client).refundCheckout('cs_1');
    expect(calls.refund).toEqual([
      [{ payment_intent: 'pi_1', metadata: { orderId: 'o-1' } }, { idempotencyKey: 'refund-cs_1' }],
    ]);
  });

  it('acepta el payment_intent expandido y no reembolsa sesiones sin pago', async () => {
    const expanded = fakeStripe({ id: 'cs_1', payment_intent: { id: 'pi_2' } as never });
    await new StripePaymentGateway(expanded.client).refundCheckout('cs_1');
    expect(expanded.calls.refund).toEqual([
      [{ payment_intent: 'pi_2', metadata: { orderId: '' } }, { idempotencyKey: 'refund-cs_1' }],
    ]);

    const unpaid = fakeStripe({ id: 'cs_1', payment_intent: null });
    await new StripePaymentGateway(unpaid.client).refundCheckout('cs_1');
    expect(unpaid.calls.refund).toEqual([]);
  });
});
