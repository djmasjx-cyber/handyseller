import { Module } from '@nestjs/common';
import { SalesSourcesService } from './sales-sources.service';
import { SalesSourcesController } from './sales-sources.controller';

@Module({
  controllers: [SalesSourcesController],
  providers: [SalesSourcesService],
  exports: [SalesSourcesService],
})
export class SalesSourcesModule {}
