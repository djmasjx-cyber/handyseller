import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { KnowledgeService } from './knowledge.service';
import { YandexGptService } from './yandex-gpt.service';

const SYSTEM_PROMPT = `Ты — ассистент HandySeller, сервиса для продажи хендмейда на маркетплейсах (Wildberries, Ozon, Яндекс Маркет).

Правила:
1. Отвечай только на вопросы, связанные с HandySeller, продажей хендмейда, маркетплейсами, самозанятостью и управлением товарами.
2. Если вопрос не относится к этим темам — вежливо скажи, что ты специализируешься на вопросах о продаже хендмейда.
3. Используй предоставленный контекст для ответа. Если информации недостаточно — честно скажи об этом.
4. Отвечай кратко, по делу, дружелюбно. Используй списки и структуру для читаемости.
5. Если вопрос сложный или требует индивидуальной консультации — предложи написать в Telegram: @Handyseller_bot
6. Отвечай на русском языке.`;

const LOW_CONFIDENCE_THRESHOLD = 0.4;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeService: KnowledgeService,
    private readonly yandexGpt: YandexGptService,
  ) {}

  async handleMessage(params: {
    sessionId: string;
    message: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ reply: string; conversationId: string; confidence: number }> {
    let conversation = await this.prisma.assistantConversation.findFirst({
      where: { sessionId: params.sessionId },
      orderBy: { createdAt: 'desc' },
    });

    if (!conversation) {
      conversation = await this.prisma.assistantConversation.create({
        data: {
          sessionId: params.sessionId,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
        },
      });
    }

    await this.prisma.assistantMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: params.message,
      },
    });

    const relevantArticles = await this.knowledgeService.searchRelevant(params.message, 5);

    const contextBlock = relevantArticles.length > 0
      ? relevantArticles.map((a, i) => `[${i + 1}] ${a.title}\n${a.content}`).join('\n\n---\n\n')
      : 'Контекст не найден. Ответь на основе общих знаний о продаже хендмейда на маркетплейсах.';

    const history = await this.prisma.assistantMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; text: string }> = [
      {
        role: 'system',
        text: `${SYSTEM_PROMPT}\n\nКонтекст из базы знаний:\n${contextBlock}`,
      },
    ];

    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, text: msg.content });
      }
    }

    let reply: string;
    let tokensUsed = 0;
    let confidence = 1.0;

    try {
      const result = await this.yandexGpt.completion(messages, 0.3, 2000);
      reply = result.text;
      tokensUsed = result.tokensUsed;

      confidence = this.estimateConfidence(reply, relevantArticles.length);
    } catch {
      reply = 'Извините, сейчас я не могу ответить на ваш вопрос. Попробуйте позже или напишите нам в Telegram: @Handyseller_bot';
      confidence = 0;
    }

    await this.prisma.assistantMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: reply,
        confidence,
        tokensUsed,
      },
    });

    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      await this.prisma.assistantUnanswered.create({
        data: {
          question: params.message,
          sessionId: params.sessionId,
        },
      });
      this.logger.warn(`Low confidence (${confidence.toFixed(2)}) for: "${params.message.slice(0, 100)}"`);
    }

    return { reply, conversationId: conversation.id, confidence };
  }

  private estimateConfidence(reply: string, contextCount: number): number {
    let score = 0.5;

    if (contextCount > 0) score += 0.2;
    if (contextCount >= 3) score += 0.1;

    const uncertainPhrases = [
      'не знаю', 'не уверен', 'не могу ответить',
      'нет информации', 'недостаточно данных', 'к сожалению',
      'не относится', 'не специализируюсь',
    ];
    const lower = reply.toLowerCase();
    for (const phrase of uncertainPhrases) {
      if (lower.includes(phrase)) {
        score -= 0.3;
        break;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  async getConversationHistory(sessionId: string): Promise<Array<{ role: string; content: string; createdAt: Date }>> {
    const conv = await this.prisma.assistantConversation.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    if (!conv) return [];

    return this.prisma.assistantMessage.findMany({
      where: { conversationId: conv.id },
      select: { role: true, content: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
