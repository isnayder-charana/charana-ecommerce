import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../../../shared/infrastructure/auth/auth.decorators.js';
import { InternalApiKey } from '../../../../shared/infrastructure/auth/internal-api-key.js';
import {
  FULFILLMENT_STEPS,
  type FulfillmentResult,
  FulfillOrderUseCase,
} from '../../application/fulfill-order.use-case.js';
import { orderIdParamSchema } from './order.schemas.js';

const fulfillmentBodySchema = z.object({ step: z.enum(FULFILLMENT_STEPS) });

/**
 * Rutas INTERNAS: las llaman los workers, no las personas. No llevan token de
 * Cognito (@Public); la seguridad es la clave interna. Fuera de Swagger.
 * En AWS (fase 4) además se pueden limitar con IAM en API Gateway.
 */
@ApiExcludeController()
@Controller('internal/orders')
export class InternalOrdersController {
  constructor(
    private readonly key: InternalApiKey,
    private readonly fulfillOrder: FulfillOrderUseCase,
  ) {}

  @Post(':id/fulfillment')
  @Public()
  @HttpCode(200)
  fulfill(
    @Headers('x-internal-key') key: string | undefined,
    @Param('id', { schema: orderIdParamSchema }) id: string,
    @Body({ schema: fulfillmentBodySchema }) body: z.infer<typeof fulfillmentBodySchema>,
  ): Promise<FulfillmentResult> {
    this.key.verify(key);
    return this.fulfillOrder.execute({ id, step: body.step });
  }
}
