import { Module } from '@nestjs/common';
import { TmsScopeGuard } from '../auth/tms-scope.guard';
import { ShipmentsController } from './shipments.controller';
import { CarrierWebhooksController } from './carrier-webhooks.controller';
import { ShipmentsService } from './shipments.service';
import { ObjectStorageService } from './storage/object-storage.service';
import { CarrierSyncWorkerService } from './storage/carrier-sync-worker.service';
import { TmsStoreService } from './storage/tms-store.service';

@Module({
  controllers: [ShipmentsController, CarrierWebhooksController],
  providers: [ShipmentsService, TmsScopeGuard, TmsStoreService, ObjectStorageService, CarrierSyncWorkerService],
})
export class ShipmentsModule {}
