import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { ProductsModule } from '../products/products.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MarketplacesService } from './marketplaces.service';
import { MarketplacesController } from './marketplaces.controller';
import { MarketplaceAdapterFactory } from './adapters/marketplace-adapter.factory';
import { StockSyncListener } from './stock-sync.listener';
import { ProductMappingService } from './product-mapping.service';
import { WbSupplyService } from './wb-supply.service';
import { SyncQueueService } from './sync-queue/sync-queue.service';
import { SyncQueueProcessor } from './sync-queue/sync-queue.processor';
import { SYNC_QUEUE_NAME } from './sync-queue/sync-queue.constants';

@Module({
  imports: [
    EventEmitterModule,
    HttpModule,
    CryptoModule,
    ProductsModule,
    SubscriptionsModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    BullModule.registerQueue({ name: SYNC_QUEUE_NAME }),
  ],
  controllers: [MarketplacesController],
  providers: [
    MarketplacesService,
    MarketplaceAdapterFactory,
    ProductMappingService,
    WbSupplyService,
    StockSyncListener,
    SyncQueueService,
    SyncQueueProcessor,
  ],
  exports: [MarketplacesService, MarketplaceAdapterFactory, ProductMappingService, SyncQueueService],
})
export class MarketplacesModule {}
