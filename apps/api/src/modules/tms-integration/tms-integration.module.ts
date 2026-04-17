import { Module } from '@nestjs/common';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { DatabaseModule } from '../../common/database/database.module';
import { TmsIntegrationController } from './tms-integration.controller';
import { TmsIntegrationService } from './tms-integration.service';

@Module({
  imports: [DatabaseModule, CryptoModule],
  controllers: [TmsIntegrationController],
  providers: [TmsIntegrationService],
})
export class TmsIntegrationModule {}
