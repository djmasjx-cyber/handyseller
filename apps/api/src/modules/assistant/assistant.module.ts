import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { KnowledgeService } from './knowledge.service';
import { ContentParserService } from './content-parser.service';
import { YandexGptService } from './yandex-gpt.service';

@Module({
  imports: [HttpModule.register({ timeout: 30000 })],
  controllers: [AssistantController],
  providers: [AssistantService, KnowledgeService, ContentParserService, YandexGptService],
  exports: [AssistantService],
})
export class AssistantModule {}
