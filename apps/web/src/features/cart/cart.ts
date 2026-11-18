import { z } from 'zod';

/** Límites para que la cookie nunca pase de ~1 KB (el máximo de una cookie es 4 KB). */
export const MAX_CART_LINES = 20;
export const MAX_QUANTITY = 10;

/**
 * Qué se guarda en la cookie: SOLO el id del producto y la cantidad.
 * Nunca el precio ni el nombre: el usuario puede editar su cookie, así que el precio
 * siempre se vuelve a pedir a la API (y en el pago lo calcula el backend).
 */
export const cartLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
});

export const cartSchema = z.array(cartLineSchema).max(MAX_CART_LINES);

export type CartLine = z.infer<typeof cartLineSchema>;

/** Cuenta unidades, no líneas: 2 cables + 1 cargador = 3. */
export function countItems(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

/** Agrega o suma cantidad a un producto, sin pasar del máximo por producto. */
export function addLine(lines: CartLine[], productId: string, quantity: number): CartLine[] {
  const existing = lines.find((line) => line.productId === productId);
  if (!existing) return [...lines, { productId, quantity: Math.min(quantity, MAX_QUANTITY) }];
  return lines.map((line) =>
    line.productId === productId
      ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_QUANTITY) }
      : line,
  );
}

/** Cambia la cantidad de un producto; con 0 lo quita. */
export function setLineQuantity(
  lines: CartLine[],
  productId: string,
  quantity: number,
): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.productId !== productId);
  return lines.map((line) =>
    line.productId === productId ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY) } : line,
  );
}
