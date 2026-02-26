import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { KmsService } from './kms.service';

@Global()
@Module({
  providers: [CryptoService, KmsService],
  exports: [CryptoService, KmsService],
})
export class CryptoModule {}
