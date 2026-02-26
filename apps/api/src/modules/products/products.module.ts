import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { StockService } from './stock.service';
import { LoggerModule } from '../../common/logger/logger.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [LoggerModule, EventEmitterModule, SubscriptionsModule],
  controllers: [ProductsController],
  providers: [ProductsService, StockService],
  exports: [ProductsService, StockService],
})
export class ProductsModule {}
