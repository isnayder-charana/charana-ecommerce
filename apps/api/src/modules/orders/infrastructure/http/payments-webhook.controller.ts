import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../../../shared/infrastructure/auth/auth.decorators.js';
import { HandlePaymentEventUseCase } from '../../application/handle-payment-event.use-case.js';
import { StripeWebhookParser } from '../payments/stripe-webhook.parser.js';

/**
 * Stripe llama aquí cuando pasa algo con un pago. No lleva token de Cognito
 * (@Public): la seguridad es la FIRMA del aviso, que verifica el parser.
 * Fuera de Swagger porque no es una ruta para personas.
 */
@Controller('payments')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private readonly parser: StripeWebhookParser,
    private readonly handle: HandlePaymentEventUseCase,
  ) {}

  @Post('webhook')
  @Public()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    // La firma se calcula sobre el cuerpo EXACTO: por eso usamos rawBody y no el JSON ya parseado.
    const event = this.parser.parse(req.rawBody ?? Buffer.alloc(0), signature);
    if (event) {
      const outcome = await this.handle.execute(event);
      this.logger.log(`Aviso ${event.id} (${event.type}) del pedido ${event.orderId}: ${outcome}`);
    }
    // 200 = "recibido". Si lanzamos un error, Stripe reintenta durante 3 días.
    return { received: true };
  }
}
