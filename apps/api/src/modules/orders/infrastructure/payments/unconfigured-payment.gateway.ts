import {
  type CheckoutSession,
  type PaymentGateway,
  PaymentsNotConfiguredError,
} from '../../application/payment.gateway.js';

/**
 * ADAPTADOR para cuando no hay STRIPE_SECRET_KEY: la API arranca igual
 * (puedes probar el resto de la tienda), pero "Pagar" responde 503.
 */
export class UnconfiguredPaymentGateway implements PaymentGateway {
  createCheckout(): Promise<CheckoutSession> {
    return Promise.reject(new PaymentsNotConfiguredError());
  }

  findOpenCheckout(): Promise<CheckoutSession | null> {
    return Promise.reject(new PaymentsNotConfiguredError());
  }

  expireCheckout(): Promise<void> {
    return Promise.reject(new PaymentsNotConfiguredError());
  }

  refundCheckout(): Promise<void> {
    return Promise.reject(new PaymentsNotConfiguredError());
  }
}
