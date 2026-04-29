import { Module } from '@nestjs/common';
import { WmsAnalyticsService } from './analytics/wms-analytics.service';
import { WmsStoreService } from './storage/wms-store.service';
import { WmsController } from './wms.controller';
import { WmsLabelingService } from './labeling/wms-labeling.service';
import { WmsService } from './wms.service';

@Module({
  controllers: [WmsController],
  providers: [WmsService, WmsStoreService, WmsLabelingService, WmsAnalyticsService],
})
export class WmsModule {}
