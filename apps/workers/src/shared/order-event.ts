import { z } from 'zod';

/**
 * El CONTRATO entre la API y los workers: el `detail` que la API publica en
 * EventBridge (ver OrderEvent en apps/api). El worker no confía en lo que llega:
 * lo valida con Zod antes de usarlo.
 */
export const orderEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['OrderPlaced', 'OrderPaid', 'OrderShipped', 'OrderDelivered', 'OrderCancelled']),
  occurredAt: z.iso.datetime(),
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  /** Falta en pedidos sin correo (anteriores al paso 24 o sin ID token). */
  customerEmail: z.email().optional(),
  status: z.string().min(1),
  total: z.object({ cents: z.number().int(), currency: z.string().length(3) }),
});
export type OrderEvent = z.infer<typeof orderEventSchema>;

/**
 * EventBridge entrega a SQS un "sobre" con datos propios (`source`,
 * `detail-type`, `time`…) y nuestro evento dentro de `detail`.
 */
const envelopeSchema = z.object({
  source: z.literal('charanatech.orders'),
  'detail-type': z.string(),
  detail: orderEventSchema,
});

export class InvalidMessageError extends Error {
  override readonly name = 'InvalidMessageError';
}

/** Saca el evento del cuerpo de un mensaje SQS, o lanza InvalidMessageError. */
export function parseOrderEvent(body: string): OrderEvent {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new InvalidMessageError('El mensaje no es JSON');
  }
  const result = envelopeSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new InvalidMessageError(
      `El mensaje no es un evento de pedido válido (${issue?.path.join('.') || 'raíz'}: ${issue?.message})`,
    );
  }
  return result.data.detail;
}
