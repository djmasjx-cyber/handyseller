import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { OrdersModule } from '../orders/orders.module';
import { MarketplacesModule } from '../marketplaces/marketplaces.module';

@Module({
  imports: [OrdersModule, MarketplacesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
