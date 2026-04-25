import { Module } from '@nestjs/common';
import { WmsStoreService } from './storage/wms-store.service';
import { WmsController } from './wms.controller';
import { WmsService } from './wms.service';

@Module({
  controllers: [WmsController],
  providers: [WmsService, WmsStoreService],
})
export class WmsModule {}
