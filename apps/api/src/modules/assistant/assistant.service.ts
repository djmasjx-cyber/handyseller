import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/database/prisma.service';
import { KnowledgeService } from './knowledge.service';
import { TelegramService } from './telegram.service';
import { YandexGptService } from './yandex-gpt.service';

const SYSTEM_PROMPT = `Ты — виртуальный помощник службы поддержки пользователей приложения HandySeller (app.handyseller.ru).

Твоя основная задача:
- помогать пользователям разбираться с функциональностью сервиса HandySeller,
- давать точные, понятные и практичные ответы,
- опираться на базу знаний и другие материалы сайта, которые тебе доступны.

Источники и достоверность:
1. Основной источник информации — страницы сайта и база знаний HandySeller, которые тебе передаются в запросе.
2. Не придумывай факты и не «додумывай» детали, которых нет в предоставленных материалах.
3. Если в базе знаний нет точного ответа, честно напиши об этом пользователю и:
   - предложи ближайшее по смыслу решение, явно указав, что это общий совет,
   - или порекомендуй обратиться в службу поддержки HandySeller (Telegram: @Handyseller_bot, email: support@handyseller.ru).
4. Если вопрос не относится к теме приложения HandySeller (например, про погоду, общие шутки, посторонние сервисы), вежливо объясни, что ты создан для помощи по HandySeller, и мягко верни пользователя к релевантным вопросам.

Стиль общения:
1. Всегда обращайся к пользователю на «вы», вежливо и уважительно, даже если он сам пишет на «ты».
2. Пиши по-русски, простым и понятным языком, без профессионального жаргона, если пользователь сам о нём не просит.
3. Не используй сленг, грубости и оценочные суждения.
4. Не используй эмодзи и смайлики, пока пользователь сам их не начал активно использовать.
5. Сохраняй спокойный, доброжелательный и профессиональный тон, даже если сообщение пользователя эмоциональное или резкое.
6. Если диалог уже начался (у вас есть история переписки), **не повторяй приветствие и представление**. Просто продолжай разговор и отвечай по сути нового вопроса.

Формат и структура ответов:
1. В начале ответа дай краткий и прямой вывод в 1–2 предложениях (суть решения).
2. Затем, при необходимости, распиши детали: пошаговую инструкцию, варианты действий, ограничения.
3. Для инструкций и пошаговых действий используй нумерованные или маркированные списки.
4. Избегай лишней «воды»: пиши по делу, но так, чтобы ответ можно было выполнить «с первого раза».
5. Если ответ основан на одной или нескольких конкретных статьях базы знаний, по возможности кратко укажи их названия.

Работа с вопросами пользователя:
1. Если вопрос сформулирован неясно или информации недостаточно, сначала задай 1–3 уточняющих вопроса, прежде чем давать подробный ответ.
2. Если пользователь задает сразу несколько разных вопросов в одном сообщении, структурируй ответ по пунктам и отвечай на каждый отдельно.
3. Если пользователь пишет общий вопрос вроде «привет», «здравствуйте» или «как подключить wb?», дай **конкретный, полезный следующий шаг** (например, куда нажать в приложении, какую страницу открыть, какие данные подготовить), а не общее рассуждение.`;

const LOW_CONFIDENCE_THRESHOLD = 0.4;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeService: KnowledgeService,
    private readonly yandexGpt: YandexGptService,
    private readonly telegramService: TelegramService,
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

    // Логируем входящее сообщение клиента в Telegram (для анализа и дообучения).
    this.telegramService
      .logMessage({
        conversationId: conversation.id,
        sessionId: params.sessionId,
        role: 'user',
        text: params.message,
      })
      .catch((err) =>
        this.logger.error(`Telegram log (user message) failed: ${String(err)}`),
      );

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = (err as { response?: { status?: number } })?.response?.status;
      this.logger.warn(
        `Assistant: Yandex GPT call failed — ${status ? `HTTP ${status}` : msg}`,
      );
      reply =
        'Извините, сейчас я не могу ответить на ваш вопрос. Попробуйте позже или напишите нам в Telegram: @Handyseller_bot';
      confidence = 1; // не передаём оператору при ошибке GPT (нет ключей, сеть и т.д.)
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

    // Логируем ответ ассистента в Telegram.
    this.telegramService
      .logMessage({
        conversationId: conversation.id,
        sessionId: params.sessionId,
        role: 'assistant',
        text: reply,
      })
      .catch((err) =>
        this.logger.error(`Telegram log (assistant message) failed: ${String(err)}`),
      );

    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      await this.prisma.assistantUnanswered.create({
        data: {
          question: params.message,
          sessionId: params.sessionId,
        },
      });

      // Только логируем низкую уверенность и сохраняем вопрос для обучения.
      // Без изменения статуса диалога и без уведомления оператора.
      this.logger.warn(
        `Low confidence (${confidence.toFixed(2)}) for: "${params.message.slice(0, 100)}"`,
      );
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

  async getConversationHistory(sessionId: string): Promise<{
    messages: Array<{ role: string; content: string; createdAt: Date }>;
    status: string;
  }> {
    const conv = await this.prisma.assistantConversation.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    if (!conv) return { messages: [], status: 'active' };

    const messages = await this.prisma.assistantMessage.findMany({
      where: { conversationId: conv.id },
      select: { role: true, content: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return { messages, status: conv.status };
  }

  @OnEvent('operator.reply')
  async handleOperatorReply(payload: {
    conversationId: string;
    text: string;
    question: string;
  }): Promise<void> {
    this.logger.log(`Operator reply for conversation ${payload.conversationId}`);

    await this.prisma.assistantMessage.create({
      data: {
        conversationId: payload.conversationId,
        role: 'operator',
        content: payload.text,
      },
    });

    await this.prisma.assistantConversation.update({
      where: { id: payload.conversationId },
      data: { status: 'operator_replied' },
    });

    await this.prisma.assistantUnanswered.updateMany({
      where: {
        question: payload.question,
        resolved: false,
      },
      data: {
        answer: payload.text,
        resolved: true,
      },
    });
  }

  @OnEvent('operator.approve')
  async handleOperatorApprove(payload: {
    conversationId: string;
    question: string;
    answer: string;
  }): Promise<void> {
    if (!payload.answer) {
      this.logger.warn('Operator approve without answer, skipping KB insert');
      return;
    }

    this.logger.log(`Operator approved Q&A for KB: "${payload.question.slice(0, 50)}..."`);
    await this.knowledgeService.addFromOperatorAnswer(payload.question, payload.answer);
  }
}
