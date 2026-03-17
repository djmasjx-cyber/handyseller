import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OrdersService } from './orders.service';
import { OrdersController, OrdersDiagController } from './orders.controller';
import { OrdersSyncCron } from './orders-sync.cron';
import { OrdersHoldTransitionCron } from './orders-hold-transition.cron';
import { OrdersStatsTokenSyncListener } from './orders-stats-token-sync.listener';
import { MarketplacesModule } from '../marketplaces/marketplaces.module';
import { ProductsModule } from '../products/products.module';
import { SalesSourcesModule } from '../sales-sources/sales-sources.module';

@Module({
  imports: [EventEmitterModule, MarketplacesModule, ProductsModule, SalesSourcesModule],
  controllers: [OrdersController, OrdersDiagController],
  providers: [OrdersService, OrdersSyncCron, OrdersHoldTransitionCron, OrdersStatsTokenSyncListener],
  exports: [OrdersService],
})
export class OrdersModule {}
