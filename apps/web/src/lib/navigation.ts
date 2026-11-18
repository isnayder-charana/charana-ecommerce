/**
 * Lleva el navegador a otra página (por ejemplo, la de pago de Stripe).
 * Está en su propio archivo para que los tests puedan reemplazarla.
 */
export function goTo(url: string): void {
  window.location.assign(url);
}
