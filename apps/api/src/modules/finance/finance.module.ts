import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MarketplacesModule } from '../marketplaces/marketplaces.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { CommissionSyncService } from './commission-sync.service';
import { CommissionSyncCron } from './commission-sync.cron';

@Module({
  imports: [HttpModule, MarketplacesModule],
  controllers: [FinanceController],
  providers: [FinanceService, CommissionSyncService, CommissionSyncCron],
  exports: [FinanceService, CommissionSyncService],
})
export class FinanceModule {}
