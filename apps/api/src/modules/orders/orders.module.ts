import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import Stripe from 'stripe';
import type { Env } from '../../config/env.js';
import {
  DYNAMODB_CLIENT,
  type DynamoDBDocumentClient,
} from '../../shared/infrastructure/database/dynamodb.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../catalog/application/product.repository.js';
import { AdvanceOrderStatusUseCase } from './application/advance-order-status.use-case.js';
import { FulfillOrderUseCase } from './application/fulfill-order.use-case.js';
import { InternalApiKey } from '../../shared/infrastructure/auth/internal-api-key.js';
import { InternalOrdersController } from './infrastructure/http/internal-orders.controller.js';
import { CancelOrderUseCase } from './application/cancel-order.use-case.js';
import { GetOrderUseCase } from './application/get-order.use-case.js';
import { ListMyOrdersUseCase } from './application/list-my-orders.use-case.js';
import { ListOrderEmailsUseCase } from './application/list-order-emails.use-case.js';
import { ORDER_EMAILS_READER, type OrderEmailsReader } from './application/order-emails.js';
import { ORDER_REPOSITORY, type OrderRepository } from './application/order.repository.js';
import { PlaceOrderUseCase } from './application/place-order.use-case.js';
import {
  EVENT_PUBLISHER,
  type EventPublisher,
  OUTBOX_STORE,
  type OutboxStore,
} from './application/order-events.js';
import { PublishOutboxUseCase } from './application/publish-outbox.use-case.js';
import { HandlePaymentEventUseCase } from './application/handle-payment-event.use-case.js';
import { PROCESSED_EVENT_STORE, type ProcessedEventStore } from './application/payment-event.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from './application/payment.gateway.js';
import { StartCheckoutUseCase } from './application/start-checkout.use-case.js';
import { STOCK_GATEWAY, type StockGateway } from './application/stock.gateway.js';
import { CatalogStockGateway } from './infrastructure/catalog/catalog-stock.gateway.js';
import { EventBridgePublisher } from './infrastructure/events/eventbridge-event.publisher.js';
import { LoggingEventPublisher } from './infrastructure/events/logging-event.publisher.js';
import { OutboxRelayService } from './infrastructure/events/outbox-relay.service.js';
import { DynamoDbOutboxStore } from './infrastructure/persistence/dynamodb-outbox.repository.js';
import { InMemoryOutboxStore } from './infrastructure/persistence/in-memory-outbox.store.js';
import { OrdersController } from './infrastructure/http/orders.controller.js';
import { PaymentsWebhookController } from './infrastructure/http/payments-webhook.controller.js';
import { StripeWebhookParser } from './infrastructure/payments/stripe-webhook.parser.js';
import { DynamoDbProcessedEventStore } from './infrastructure/persistence/dynamodb-processed-event.repository.js';
import { InMemoryProcessedEventStore } from './infrastructure/persistence/in-memory-processed-event.store.js';
import { StripePaymentGateway } from './infrastructure/payments/stripe-payment.gateway.js';
import { UnconfiguredPaymentGateway } from './infrastructure/payments/unconfigured-payment.gateway.js';
import { DynamoDbOrderEmailsReader } from './infrastructure/persistence/dynamodb-order-emails.reader.js';
import { InMemoryOrderEmailsReader } from './infrastructure/persistence/in-memory-order-emails.reader.js';
import { DynamoDbOrderRepository } from './infrastructure/persistence/dynamodb-order.repository.js';
import { InMemoryOrderRepository } from './infrastructure/persistence/in-memory-order.repository.js';

const clock = () => new Date();

/** Minutos para pagar antes de que la sesión de Stripe expire (Stripe exige al menos 30). */
const PAYMENT_WINDOW_MINUTES = 30;

@Module({
  imports: [CatalogModule],
  controllers: [OrdersController, PaymentsWebhookController, InternalOrdersController],
  providers: [
    {
      // La bandeja de salida (outbox) vive junto a los pedidos: DynamoDB o memoria.
      provide: OUTBOX_STORE,
      inject: [ConfigService, DYNAMODB_CLIENT],
      useFactory: (config: ConfigService<Env, true>, dynamo: DynamoDBDocumentClient | null) =>
        config.get('PERSISTENCE', { infer: true }) === 'database' && dynamo
          ? new DynamoDbOutboxStore(dynamo, config.get('DYNAMODB_TABLE', { infer: true }))
          : new InMemoryOutboxStore(),
    },
    {
      // Igual que en Catalog: PERSISTENCE decide el adaptador (DynamoDB o memoria).
      provide: ORDER_REPOSITORY,
      inject: [ConfigService, DYNAMODB_CLIENT, OUTBOX_STORE],
      useFactory: (
        config: ConfigService<Env, true>,
        dynamo: DynamoDBDocumentClient | null,
        outbox: OutboxStore,
      ) =>
        config.get('PERSISTENCE', { infer: true }) === 'database' && dynamo
          ? new DynamoDbOrderRepository(dynamo, config.get('DYNAMODB_TABLE', { infer: true }))
          : new InMemoryOrderRepository(outbox as InMemoryOutboxStore),
    },
    {
      // Con base de datos publicamos en EventBridge (LocalStack en local); en memoria, al log.
      provide: EVENT_PUBLISHER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EventPublisher => {
        if (config.get('PERSISTENCE', { infer: true }) !== 'database') {
          return new LoggingEventPublisher();
        }
        const endpoint = config.get('EVENTBRIDGE_ENDPOINT', { infer: true });
        const client = new EventBridgeClient({
          region: config.get('AWS_REGION', { infer: true }),
          endpoint,
          // LocalStack acepta cualquier credencial; en AWS se usan las del rol de la Lambda.
          ...(endpoint && { credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }),
        });
        return new EventBridgePublisher(client, config.get('EVENT_BUS_NAME', { infer: true }));
      },
    },
    {
      provide: PublishOutboxUseCase,
      inject: [OUTBOX_STORE, EVENT_PUBLISHER],
      useFactory: (outbox: OutboxStore, publisher: EventPublisher) =>
        new PublishOutboxUseCase(outbox, publisher),
    },
    {
      provide: OutboxRelayService,
      inject: [PublishOutboxUseCase, ConfigService],
      useFactory: (publishOutbox: PublishOutboxUseCase, config: ConfigService<Env, true>) =>
        new OutboxRelayService(
          publishOutbox,
          config.get('OUTBOX_RELAY_INTERVAL_MS', { infer: true }),
        ),
    },
    {
      provide: STOCK_GATEWAY,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository) => new CatalogStockGateway(products),
    },
    {
      provide: PlaceOrderUseCase,
      inject: [ORDER_REPOSITORY, STOCK_GATEWAY],
      useFactory: (orders: OrderRepository, stock: StockGateway) =>
        new PlaceOrderUseCase(orders, stock, randomUUID, clock),
    },
    {
      provide: ListMyOrdersUseCase,
      inject: [ORDER_REPOSITORY],
      useFactory: (orders: OrderRepository) => new ListMyOrdersUseCase(orders),
    },
    {
      provide: GetOrderUseCase,
      inject: [ORDER_REPOSITORY],
      useFactory: (orders: OrderRepository) => new GetOrderUseCase(orders),
    },
    {
      // Paso 34: los correos de cada pedido (los guarda el worker notifications).
      provide: ORDER_EMAILS_READER,
      inject: [ConfigService, DYNAMODB_CLIENT],
      useFactory: (config: ConfigService<Env, true>, dynamo: DynamoDBDocumentClient | null) =>
        config.get('PERSISTENCE', { infer: true }) === 'database' && dynamo
          ? new DynamoDbOrderEmailsReader(dynamo, config.get('DYNAMODB_TABLE', { infer: true }))
          : new InMemoryOrderEmailsReader(),
    },
    {
      provide: ListOrderEmailsUseCase,
      inject: [ORDER_REPOSITORY, ORDER_EMAILS_READER],
      useFactory: (orders: OrderRepository, emails: OrderEmailsReader) =>
        new ListOrderEmailsUseCase(orders, emails),
    },
    {
      provide: CancelOrderUseCase,
      inject: [ORDER_REPOSITORY, STOCK_GATEWAY, PAYMENT_GATEWAY],
      useFactory: (orders: OrderRepository, stock: StockGateway, payments: PaymentGateway) =>
        new CancelOrderUseCase(orders, stock, payments, clock),
    },
    {
      provide: PROCESSED_EVENT_STORE,
      inject: [ConfigService, DYNAMODB_CLIENT],
      useFactory: (config: ConfigService<Env, true>, dynamo: DynamoDBDocumentClient | null) =>
        config.get('PERSISTENCE', { infer: true }) === 'database' && dynamo
          ? new DynamoDbProcessedEventStore(dynamo, config.get('DYNAMODB_TABLE', { infer: true }))
          : new InMemoryProcessedEventStore(),
    },
    {
      provide: InternalApiKey,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new InternalApiKey(config.get('INTERNAL_API_KEY', { infer: true })),
    },
    {
      provide: FulfillOrderUseCase,
      inject: [ORDER_REPOSITORY],
      useFactory: (orders: OrderRepository) => new FulfillOrderUseCase(orders, clock),
    },
    {
      provide: StripeWebhookParser,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new StripeWebhookParser(config.get('STRIPE_WEBHOOK_SECRET', { infer: true })),
    },
    {
      provide: HandlePaymentEventUseCase,
      inject: [ORDER_REPOSITORY, STOCK_GATEWAY, PAYMENT_GATEWAY, PROCESSED_EVENT_STORE],
      useFactory: (
        orders: OrderRepository,
        stock: StockGateway,
        payments: PaymentGateway,
        processed: ProcessedEventStore,
      ) => new HandlePaymentEventUseCase(orders, stock, payments, processed, clock),
    },
    {
      // Con clave de Stripe, el adaptador real; sin ella, uno que responde 503.
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const key = config.get('STRIPE_SECRET_KEY', { infer: true });
        return key
          ? new StripePaymentGateway(new Stripe(key, { maxNetworkRetries: 2 }))
          : new UnconfiguredPaymentGateway();
      },
    },
    {
      provide: StartCheckoutUseCase,
      inject: [ORDER_REPOSITORY, PAYMENT_GATEWAY, ConfigService],
      useFactory: (
        orders: OrderRepository,
        payments: PaymentGateway,
        config: ConfigService<Env, true>,
      ) =>
        new StartCheckoutUseCase(orders, payments, clock, {
          storeUrl: config.get('STORE_URL', { infer: true }),
          paymentWindowMinutes: PAYMENT_WINDOW_MINUTES,
        }),
    },
    {
      provide: AdvanceOrderStatusUseCase,
      inject: [ORDER_REPOSITORY],
      useFactory: (orders: OrderRepository) => new AdvanceOrderStatusUseCase(orders, clock),
    },
  ],
})
export class OrdersModule {}
