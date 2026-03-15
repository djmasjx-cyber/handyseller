import { Controller, Post, Get, Body, Query, Param, Req, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { Request } from 'express';
import { PrismaService } from '../../common/database/prisma.service';
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

class ResolveUnansweredDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  answer!: string;

  @IsOptional()
  @IsString()
  addToKb?: string;
}

@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly assistantService: AssistantService,
    private readonly contentParserService: ContentParserService,
    private readonly knowledgeService: KnowledgeService,
    private readonly prisma: PrismaService,
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
    const result = await this.assistantService.getConversationHistory(sessionId);
    return { messages: result.messages, status: result.status };
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

  @Get('unanswered')
  async getUnanswered(
    @Query('resolved') resolved?: string,
    @Query('limit') limit?: string,
  ) {
    const where: Record<string, unknown> = {};
    if (resolved === 'true') where.resolved = true;
    else if (resolved === 'false') where.resolved = false;

    const items = await this.prisma.assistantUnanswered.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit, 10) : 50,
    });
    return { items, total: items.length };
  }

  @Post('unanswered/:id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveUnanswered(
    @Param('id') id: string,
    @Body() dto: ResolveUnansweredDto,
  ) {
    const item = await this.prisma.assistantUnanswered.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Unanswered question not found');

    await this.prisma.assistantUnanswered.update({
      where: { id },
      data: { answer: dto.answer, resolved: true },
    });

    if (dto.addToKb === 'true') {
      await this.knowledgeService.addFromOperatorAnswer(item.question, dto.answer);
    }

    return { ok: true };
  }
}
