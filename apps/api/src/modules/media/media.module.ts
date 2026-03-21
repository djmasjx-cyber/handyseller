import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [HttpModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
