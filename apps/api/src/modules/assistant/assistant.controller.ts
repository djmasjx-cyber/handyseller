import { Controller, Post, Get, Body, Query, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Request } from 'express';
import { AssistantService } from './assistant.service';
import { ContentParserService } from './content-parser.service';
import { KnowledgeService } from './knowledge.service';

class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;
}

@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly assistantService: AssistantService,
    private readonly contentParserService: ContentParserService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  @Post('message')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async sendMessage(@Body() dto: SendMessageDto, @Req() req: Request) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await this.assistantService.handleMessage({
      sessionId: dto.sessionId,
      message: dto.message,
      ipAddress,
      userAgent,
    });

    return {
      reply: result.reply,
      conversationId: result.conversationId,
    };
  }

  @Get('history')
  async getHistory(@Query('sessionId') sessionId: string) {
    const messages = await this.assistantService.getConversationHistory(sessionId);
    return { messages };
  }

  @Post('parse')
  @HttpCode(HttpStatus.OK)
  async triggerParse() {
    await this.contentParserService.parseAll();
    return { ok: true };
  }

  @Get('knowledge/stats')
  async getKnowledgeStats() {
    return this.knowledgeService.getStats();
  }
}
