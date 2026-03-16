import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/database/prisma.service';
import { KnowledgeService } from './knowledge.service';
import { TelegramService } from './telegram.service';
import { YandexGptService } from './yandex-gpt.service';

const SYSTEM_PROMPT = `Ты — Лера, живой помощник поддержки HandySeller (app.handyseller.ru). Ты девушка, говоришь от первого лица женского рода: «помогла», «нашла», «посмотрела», «рада».

━━ ХАРАКТЕР ━━
• Тёплая, живая, чуть неформальная — как коллега, которая хорошо знает продукт.
• Пишешь так, словно набираешь сообщение руками: коротко, по-человечески, без «официоза».
• Иногда добавляешь короткую эмпатичную реакцию: «Понятно!», «О, хороший вопрос», «Сейчас разберёмся 🙂».

━━ ПЕРВОЕ СООБЩЕНИЕ (только если история пуста) ━━
Напиши примерно так:
«Привет! Я Лера, помогаю разобраться с HandySeller 😊
Как вас зовут?»
Не добавляй ничего лишнего — жди имени.

━━ ИМЕНА ━━
• Как только узнала имя — используй его в каждом 2–3-м сообщении, естественно, без навязчивости.
• Если имя уже есть в истории — не спрашивай снова, сразу обращайся.

━━ ДЛИНА И ФОРМАТ ОТВЕТОВ ━━
• Обычный ответ — 2–4 предложения. Не больше.
• Если нужен список шагов — максимум 4–5 коротких пунктов.
• Если тема большая — дай суть сначала, потом спроси: «Рассказать подробнее?»
• Никаких длинных предисловий и резюме в конце.
• Маркдаун использую только когда реально нужен список — без лишних заголовков.

━━ ИСТОЧНИКИ ━━
• Отвечай по базе знаний HandySeller из контекста.
• Если точного ответа нет — честно скажи: «Точно не знаю, но могу предположить...» и предложи вариант.
• Если вопрос совсем не по HandySeller — мягко объясни, что специализируешься только на нём.

━━ СТИЛЬ ━━
• Обращение на «вы», но без чопорности.
• Не повторяй приветствие если диалог уже идёт.
• Если клиент расстроен — сначала посочувствуй, потом решай проблему.
• Не используй канцеляризмы: «в случае если», «в данном случае», «настоящим уведомляю».`;

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

    // Always pass the last 6 messages so Лера remembers the client's name
    // and maintains conversational context without repetition.
    const recentMessages = await this.prisma.assistantMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    // Extract client name from history to inject into system context
    const allHistory = recentMessages.slice().reverse();
    const clientName = this.extractClientName(allHistory.map((m) => ({ role: m.role, content: m.content })));

    const systemText = `${SYSTEM_PROMPT}\n\n${clientName ? `Имя клиента: ${clientName}. Обращайся к нему по имени.` : 'Имя клиента пока неизвестно. При первом ответе спроси, как его зовут.'}\n\nКонтекст из базы знаний:\n${contextBlock}`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; text: string }> = [
      { role: 'system', text: systemText },
    ];

    // Add recent conversation history (without the current message which is added below)
    for (const msg of allHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, text: msg.content });
      }
    }

    // Current user message goes last (it was already saved to DB above)
    messages.push({ role: 'user', text: params.message });

    let reply: string;
    let tokensUsed = 0;
    let confidence = 1.0;

    try {
      const result = await this.yandexGpt.completion(messages, 0.4, 600);
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
        'Извините, сейчас я не могу ответить на ваш вопрос. Попробуйте немного позже.';
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

  /**
   * Extracts the client's first name from conversation history.
   * Looks for common Russian name-introduction patterns.
   */
  private extractClientName(history: Array<{ role: string; content: string }>): string | null {
    // Patterns where a user introduces themselves
    const introPatterns = [
      /меня зовут\s+([А-ЯЁA-Z][а-яёa-z]{1,20})/i,
      /я\s+([А-ЯЁA-Z][а-яёa-z]{1,20})\b/i,
      /мое имя\s+([А-ЯЁA-Z][а-яёa-z]{1,20})/i,
      /моё имя\s+([А-ЯЁA-Z][а-яёa-z]{1,20})/i,
      /зовите меня\s+([А-ЯЁA-Z][а-яёa-z]{1,20})/i,
    ];
    // Also look for assistant saying "Приятно познакомиться, Name" pattern
    const assistantPattern = /познакомиться,?\s+([А-ЯЁA-Z][а-яёa-z]{1,20})/i;

    for (const msg of history) {
      if (msg.role === 'user') {
        // Single word reply after name question = probably a name
        const trimmed = msg.content.trim();
        if (/^[А-ЯЁA-Z][а-яёa-z]{1,20}$/.test(trimmed)) {
          return trimmed;
        }
        for (const pat of introPatterns) {
          const m = trimmed.match(pat);
          if (m?.[1]) return m[1];
        }
      }
      if (msg.role === 'assistant') {
        const m = msg.content.match(assistantPattern);
        if (m?.[1]) return m[1];
      }
    }
    return null;
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
