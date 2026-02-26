import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MarketplacesModule } from '../marketplaces/marketplaces.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [UsersModule, PaymentsModule, SubscriptionsModule, MarketplacesModule, OrdersModule],
  controllers: [AdminController],
})
export class AdminModule {}
