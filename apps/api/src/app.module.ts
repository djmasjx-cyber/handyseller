import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CryptoModule } from './common/crypto/crypto.module';
import { DatabaseModule } from './common/database/database.module';
import { LoggerModule } from './common/logger/logger.module';
import { MonitoringModule } from './common/monitoring/monitoring.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { MarketplacesModule } from './modules/marketplaces/marketplaces.module';
import { OrdersModule } from './modules/orders/orders.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminModule } from './modules/admin/admin.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SalesSourcesModule } from './modules/sales-sources/sales-sources.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { MediaModule } from './modules/media/media.module';
import { ReviewsModule } from './modules/reviews/reviews.module';

function getTracker(req: { headers?: Record<string, string | string[] | undefined>; ip?: string; socket?: { remoteAddress?: string } }): string {
  const headers = req.headers ?? {};
  const authHeader = headers['authorization'] as string | undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sub?: string };
      if (payload.sub) return `user:${payload.sub}`;
    } catch {
      // ignore
    }
  }
  const forwarded = headers['x-forwarded-for'] as string | undefined;
  const ip = forwarded?.split(',')[0]?.trim() ?? req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  return `ip:${ip}`;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: (context) => {
            const req = context.switchToHttp().getRequest();
            const tracker = getTracker(req);
            return tracker.startsWith('user:') ? 100 : 1000;
          },
          getTracker: (req) => getTracker(req),
        },
      ],
    }),
    CryptoModule,
    DatabaseModule,
    LoggerModule,
    MonitoringModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    MaterialsModule,
    MarketplacesModule,
    OrdersModule,
    SubscriptionsModule,
    AnalyticsModule,
    DashboardModule,
    AdminModule,
    PaymentsModule,
    SalesSourcesModule,
    AssistantModule,
    MediaModule,
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
