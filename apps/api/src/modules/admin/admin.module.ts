import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { DatabaseModule } from '../../common/database/database.module';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MarketplacesModule } from '../marketplaces/marketplaces.module';
import { OrdersModule } from '../orders/orders.module';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    PaymentsModule,
    SubscriptionsModule,
    MarketplacesModule,
    OrdersModule,
    ReviewsModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
