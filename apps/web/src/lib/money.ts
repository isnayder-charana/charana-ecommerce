/**
 * La API guarda el dinero en centavos (priceCents) para no tener errores de redondeo.
 * Aquí lo convertimos a texto solo para mostrarlo.
 */
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol', // "$ 59.99" en lugar de "USD 59.99"
  }).format(cents / 100);
}

/** Porcentaje de descuento redondeado: 4999 → 3499 = 30. */
export function discountPercent(priceCents: number, compareAtCents: number): number {
  return Math.round((1 - priceCents / compareAtCents) * 100);
}
