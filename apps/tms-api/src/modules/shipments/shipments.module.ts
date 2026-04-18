import { Module } from '@nestjs/common';
import { TmsScopeGuard } from '../auth/tms-scope.guard';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  controllers: [ShipmentsController],
  providers: [ShipmentsService, TmsScopeGuard],
})
export class ShipmentsModule {}
