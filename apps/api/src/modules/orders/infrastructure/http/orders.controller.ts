import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { AdminOnly } from '../../../../shared/infrastructure/auth/auth.decorators.js';
import {
  TOKEN_VERIFIER,
  type TokenVerifier,
} from '../../../../shared/infrastructure/auth/token-verifier.js';
import { AdvanceOrderStatusUseCase } from '../../application/advance-order-status.use-case.js';
import { CancelOrderUseCase } from '../../application/cancel-order.use-case.js';
import { GetOrderUseCase } from '../../application/get-order.use-case.js';
import { ListMyOrdersUseCase } from '../../application/list-my-orders.use-case.js';
import { ListOrderEmailsUseCase } from '../../application/list-order-emails.use-case.js';
import { PlaceOrderUseCase } from '../../application/place-order.use-case.js';
import { StartCheckoutUseCase } from '../../application/start-checkout.use-case.js';
import { CustomerId } from './customer-id.decorator.js';
import {
  advanceStatusBodySchema,
  orderIdParamSchema,
  placeOrderBodySchema,
} from './order.schemas.js';

const OrderId = () => Param('id', { schema: orderIdParamSchema });

@ApiTags('Pedidos')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly placeOrder: PlaceOrderUseCase,
    private readonly listMyOrders: ListMyOrdersUseCase,
    private readonly getOrder: GetOrderUseCase,
    private readonly listOrderEmails: ListOrderEmailsUseCase,
    private readonly cancelOrder: CancelOrderUseCase,
    private readonly advanceStatus: AdvanceOrderStatusUseCase,
    private readonly startCheckout: StartCheckoutUseCase,
    @Inject(TOKEN_VERIFIER) private readonly tokens: TokenVerifier,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crea un pedido y reserva el stock' })
  @ApiHeader({
    name: 'X-Id-Token',
    required: false,
    description: 'ID token de Cognito de la misma persona: de ahí sale el correo para los avisos.',
  })
  async place(
    @CustomerId() customerId: string,
    @Headers('x-id-token') idToken: string | undefined,
    @Body({ schema: placeOrderBodySchema }) body: z.infer<typeof placeOrderBodySchema>,
  ) {
    const customerEmail = idToken ? await this.emailFrom(idToken, customerId) : null;
    return this.placeOrder.execute({ customerId, customerEmail, items: body.items });
  }

  /** El correo solo vale si viene en un ID token firmado por Cognito y de esta misma persona. */
  private async emailFrom(idToken: string, customerId: string): Promise<string | null> {
    try {
      return await this.tokens.emailOf(idToken, customerId);
    } catch {
      throw new UnauthorizedException('ID token inválido');
    }
  }

  @Get()
  @ApiOperation({ summary: 'Mis pedidos, del más nuevo al más antiguo' })
  listMine(@CustomerId() customerId: string) {
    return this.listMyOrders.execute({ customerId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de uno de mis pedidos' })
  get(@CustomerId() customerId: string, @OrderId() id: string) {
    return this.getOrder.execute({ id, customerId });
  }

  @Get(':id/emails')
  @ApiOperation({
    summary: 'Los correos de uno de mis pedidos',
    description:
      'Incluye los que SES no envió por estar en sandbox (delivered: false): la tienda los muestra como "el correo que te habríamos enviado".',
  })
  emails(@CustomerId() customerId: string, @OrderId() id: string) {
    return this.listOrderEmails.execute({ id, customerId });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancela un pedido y devuelve el stock' })
  cancel(@CustomerId() customerId: string, @OrderId() id: string) {
    return this.cancelOrder.execute({ id, customerId });
  }

  @Post(':id/checkout')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Abre la página de pago de Stripe y devuelve su URL',
    description:
      'Reutiliza la sesión si sigue abierta. 409 si el pedido ya no está pendiente de pago; 503 si los pagos no están configurados.',
  })
  checkout(@CustomerId() customerId: string, @OrderId() id: string) {
    return this.startCheckout.execute({ id, customerId });
  }

  @Patch(':id/status')
  @AdminOnly()
  @ApiOperation({ summary: 'Avanza el estado: pay, ship o deliver (solo admin)' })
  advance(
    @OrderId() id: string,
    @Body({ schema: advanceStatusBodySchema })
    body: z.infer<typeof advanceStatusBodySchema>,
  ) {
    return this.advanceStatus.execute({ id, action: body.action });
  }
}
