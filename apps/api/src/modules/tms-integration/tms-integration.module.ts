import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SalesSourcesModule } from '../sales-sources/sales-sources.module';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { DatabaseModule } from '../../common/database/database.module';
import { TmsIntegrationController } from './tms-integration.controller';
import { TmsIntegrationService } from './tms-integration.service';
import { TmsM2mClientsController } from './tms-m2m-clients.controller';
import { TmsM2mService } from './tms-m2m.service';
import { TmsOAuthController } from './tms-oauth.controller';
import { TmsDocsController } from './tms-docs.controller';

@Module({
  imports: [DatabaseModule, CryptoModule, AuthModule, SalesSourcesModule],
  controllers: [
    TmsIntegrationController,
    TmsOAuthController,
    TmsM2mClientsController,
    TmsDocsController,
  ],
  providers: [TmsIntegrationService, TmsM2mService],
})
export class TmsIntegrationModule {}
