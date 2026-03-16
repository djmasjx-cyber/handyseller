import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MediaController } from './media.controller';

@Module({
  imports: [HttpModule],
  controllers: [MediaController],
})
export class MediaModule {}
