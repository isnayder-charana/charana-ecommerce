import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './shared/infrastructure/database/database.module.js';
import { AuthModule } from './shared/infrastructure/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { HealthController } from './shared/infrastructure/http/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // En los tests (Jest pone NODE_ENV=test) no se lee apps/api/.env: así el resultado
      // no depende de lo que tengas configurado en tu PC (base de datos, claves…).
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    DatabaseModule,
    AuthModule,
    CatalogModule,
    OrdersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
