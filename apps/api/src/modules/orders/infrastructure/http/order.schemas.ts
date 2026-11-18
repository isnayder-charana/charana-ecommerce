import { z } from 'zod';
import { ORDER_ACTIONS } from '../../application/advance-order-status.use-case.js';

export const placeOrderBodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.uuid().meta({ examples: ['7d1c2b6e-1f0a-4c1e-9a52-0c7f3a9e1001'] }),
        quantity: z
          .number()
          .int()
          .meta({ examples: [1] }),
      }),
    )
    .min(1),
});

export const advanceStatusBodySchema = z.object({ action: z.enum(ORDER_ACTIONS) });

export const orderIdParamSchema = z.uuid();
