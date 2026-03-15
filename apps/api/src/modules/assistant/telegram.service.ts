import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/database/prisma.service';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number };
    text?: string;
    reply_to_message?: {
      message_id: number;
      text?: string;
    };
  };
}

interface NotificationMeta {
  conversationId: string;
  question: string;
  lastOperatorReply?: string;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly baseUrl: string | null = null;
  private operatorChatIds: number[] = [];
  private pollingAborted = false;
  private lastUpdateId = 0;
  private readonly notificationMeta = new Map<number, NotificationMeta>();
  // shortId (first 8 hex chars of UUID) -> full conversationId
  private readonly shortIdMap = new Map<string, string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (token) {
      this.baseUrl = `https://api.telegram.org/bot${token}`;
    } else {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN is not set. Telegram notifications and polling are disabled.',
      );
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.baseUrl) {
      try {
        const operators = await this.prisma.assistantOperator.findMany();
        this.operatorChatIds = operators
          .map((o) => parseInt(o.chatId, 10))
          .filter((id) => !Number.isNaN(id));
        if (this.operatorChatIds.length > 0) {
          this.logger.log(
            `Loaded ${this.operatorChatIds.length} Telegram operator chat_id(s) from DB`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Failed to load assistant operators from DB: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      this.startPolling();
    }
  }

  onModuleDestroy(): void {
    this.pollingAborted = true;
  }

  async logMessage(params: {
    conversationId: string;
    sessionId: string;
    role: 'user' | 'assistant' | 'operator';
    text: string;
  }): Promise<void> {
    if (!this.baseUrl) return;
    if (this.operatorChatIds.length === 0) {
      // Логи не критичны, просто пропускаем, если оператор ещё не зарегистрирован.
      return;
    }

    // Keep short ID in memory for tag-based replies (#shortId answer)
    const shortId = params.conversationId.replace(/-/g, '').slice(0, 8);
    this.shortIdMap.set(shortId, params.conversationId);

    const header =
      params.role === 'user'
        ? '🧑‍💻 Клиент'
        : params.role === 'assistant'
          ? '🤖 Ассистент'
          : '👤 Оператор';

    const body = [
      `${header} [#${shortId}]`,
      '',
      params.text.slice(0, 800),
      '',
      `Чтобы ответить клиенту: ответьте на это сообщение (reply) или напишите #${shortId} <текст>`,
    ].join('\n');

    for (const chatId of this.operatorChatIds) {
      try {
        const { messageId } = await this.sendMessage(chatId, body);
        // Store mapping so operator can reply to this log message to reach the client
        this.notificationMeta.set(messageId, {
          conversationId: params.conversationId,
          question: params.text.slice(0, 300),
        });
      } catch (err) {
        this.logger.error(
          `Failed to send Telegram log message to ${chatId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  async notifyOperator(params: {
    conversationId: string;
    sessionId: string;
    question: string;
    context: string;
  }): Promise<void> {
    if (!this.baseUrl) return;
    if (this.operatorChatIds.length === 0) {
      this.logger.warn(
        'No assistant operators registered yet. Skipping notification.',
      );
      return;
    }

    const text = [
      '🔔 *Новый вопрос без ответа*',
      '',
      `*Вопрос:* ${params.question}`,
      '',
      '*Контекст беседы:*',
      params.context,
      '',
      `_Conversation ID: ${params.conversationId}_`,
      `_Session: ${params.sessionId}_`,
      '',
      'Ответьте на это сообщение, чтобы ваш ответ попал клиенту.',
      'Отправьте /approve в ответ, чтобы добавить Q&A в базу знаний.',
    ].join('\n');

    for (const chatId of this.operatorChatIds) {
      try {
        const { messageId } = await this.sendMessage(chatId, text, {
          parseMode: 'Markdown',
        });
        this.notificationMeta.set(messageId, {
          conversationId: params.conversationId,
          question: params.question,
        });
      } catch (err) {
        this.logger.error(
          `Failed to send Telegram notification to ${chatId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private startPolling(): void {
    const poll = async (): Promise<void> => {
      if (this.pollingAborted) return;

      try {
        const updates = await this.getUpdates(this.lastUpdateId);
        for (const update of updates) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id + 1);
          await this.processUpdate(update);
        }
      } catch (err) {
        this.logger.error(
          `Telegram polling error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!this.pollingAborted) {
        setTimeout(poll, 1000);
      }
    };

    poll();
  }

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message;
    if (!msg?.chat?.id || msg.text === undefined) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // /start is always handled (registers the chat as operator)
    if (text === '/start' || text.startsWith('/start@')) {
      await this.handleStartCommand(chatId, msg.chat.type);
      return;
    }

    // Only process messages from registered operator chats — everything else is ignored
    if (!this.operatorChatIds.includes(chatId)) {
      this.logger.debug(`Ignored message from unregistered chat ${chatId}`);
      return;
    }

    // Reply to a bot message → operator is replying to a specific conversation
    if (msg.reply_to_message) {
      const replyToId = msg.reply_to_message.message_id;
      const replyToText = msg.reply_to_message.text ?? '';
      if (text === '/approve' || text.startsWith('/approve@')) {
        await this.handleApproveCommand(chatId, replyToId, replyToText);
        return;
      }
      await this.handleOperatorReply(chatId, text, replyToId, replyToText);
      return;
    }

    // Tag-based reply: #shortId Answer text (e.g. #a2b4c6d8 Вот ваш ответ)
    const tagMatch = text.match(/^#([a-f0-9]{8})\s+([\s\S]+)/i);
    if (tagMatch) {
      await this.handleTaggedReply(chatId, tagMatch[1].toLowerCase(), tagMatch[2].trim());
      return;
    }

    // Everything else is treated as internal group discussion — silently ignored
    this.logger.debug(`Internal discussion ignored from chat ${chatId}: ${text.slice(0, 50)}`);
  }

  private async handleOperatorReply(
    chatId: number,
    text: string,
    replyToMessageId: number,
    replyToMessageText: string,
  ): Promise<void> {
    const meta = this.notificationMeta.get(replyToMessageId);
    if (!meta) {
      const conversationId = this.parseConversationId(replyToMessageText);
      const question = this.parseQuestion(replyToMessageText);
      if (conversationId && question) {
        this.eventEmitter.emit('operator.reply', {
          conversationId,
          text,
          question,
        });
      } else {
        this.logger.warn(
          `Could not parse conversationId/question from reply_to_message (id=${replyToMessageId})`,
        );
      }
      return;
    }

    meta.lastOperatorReply = text;
    this.notificationMeta.set(replyToMessageId, meta);

    this.eventEmitter.emit('operator.reply', {
      conversationId: meta.conversationId,
      text,
      question: meta.question,
    });
  }

  private async handleTaggedReply(
    chatId: number,
    shortId: string,
    answer: string,
  ): Promise<void> {
    // Try in-memory map first, then fall back to DB prefix lookup
    let conversationId = this.shortIdMap.get(shortId) ?? null;

    if (!conversationId) {
      try {
        const conv = await this.prisma.assistantConversation.findFirst({
          where: { id: { startsWith: shortId } },
          select: { id: true },
        });
        conversationId = conv?.id ?? null;
        if (conversationId) this.shortIdMap.set(shortId, conversationId);
      } catch {
        conversationId = null;
      }
    }

    if (!conversationId) {
      await this.sendMessage(
        chatId,
        `❌ Заявка #${shortId} не найдена. Проверьте ID из сообщения бота.`,
      );
      return;
    }

    this.eventEmitter.emit('operator.reply', {
      conversationId,
      text: answer,
      question: '',
    });

    await this.sendMessage(chatId, `✅ Ответ отправлен клиенту по заявке #${shortId}`);
  }

  private async handleStartCommand(chatId: number, chatType?: string): Promise<void> {
    const chatIdStr = String(chatId);
    const isGroup = chatType === 'group' || chatType === 'supergroup';
    try {
      await this.prisma.assistantOperator.upsert({
        where: { chatId: chatIdStr },
        update: { type: isGroup ? 'group' : 'primary' },
        create: { chatId: chatIdStr, type: isGroup ? 'group' : 'primary' },
      });
      if (!this.operatorChatIds.includes(chatId)) {
        this.operatorChatIds.push(chatId);
      }
      this.logger.log(
        `Operator chat_id registered: ${chatId} (${isGroup ? 'group' : 'private'})`,
      );
      await this.sendMessage(
        chatId,
        isGroup
          ? '✅ Группа зарегистрирована. Все диалоги из виджета будут дублироваться сюда.'
          : '✅ Вы зарегистрированы как оператор. Теперь вы будете получать все сообщения ассистента и логи диалогов.',
      );
    } catch (err) {
      this.logger.error(
        `Failed to register operator chat_id ${chatId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.sendMessage(
        chatId,
        'Не удалось зарегистрировать из-за ошибки на сервере.',
      );
    }
  }

  private async handleApproveCommand(
    chatId: number,
    replyToMessageId: number,
    replyToMessageText: string,
  ): Promise<void> {
    const meta = this.notificationMeta.get(replyToMessageId);
    if (!meta) {
      const conversationId = this.parseConversationId(replyToMessageText);
      const question = this.parseQuestion(replyToMessageText);
      if (conversationId && question) {
        this.eventEmitter.emit('operator.approve', {
          conversationId,
          question,
          answer: '',
        });
        await this.sendMessage(
          chatId,
          'Ответ не найден в цепочке. Добавьте Q&A вручную, если необходимо.',
        );
      } else {
        await this.sendMessage(
          chatId,
          'Не удалось определить диалог. Ответьте на уведомление с ответом, затем отправьте /approve.',
        );
      }
      return;
    }

    const answer = meta.lastOperatorReply ?? '';
    if (!answer) {
      await this.sendMessage(
        chatId,
        'Сначала ответьте на уведомление текстом ответа, затем отправьте /approve.',
      );
      return;
    }

    this.eventEmitter.emit('operator.approve', {
      conversationId: meta.conversationId,
      question: meta.question,
      answer,
    });
    await this.sendMessage(chatId, 'Q&A добавлено в базу знаний.');
  }

  private parseConversationId(text: string): string | null {
    const match = text.match(/Conversation ID:\s*([a-zA-Z0-9-]+)/);
    return match ? match[1].trim() : null;
  }

  private parseQuestion(text: string): string | null {
    const match = text.match(/\*Вопрос:\*\s*([\s\S]*?)(?=\n\s*\*Контекст|$)/);
    return match ? match[1].trim() : null;
  }

  private async sendMessage(
    chatId: number,
    text: string,
    options?: { parseMode?: string; replyMarkup?: unknown },
  ): Promise<{ messageId: number }> {
    if (!this.baseUrl) {
      throw new Error('Telegram bot is not configured');
    }

    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (options?.parseMode) body.parse_mode = options.parseMode;
    if (options?.replyMarkup !== undefined) body.reply_markup = options.replyMarkup;

    const res = await fetch(`${this.baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Telegram API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { ok: boolean; result?: { message_id?: number } };
    if (!data.ok || !data.result?.message_id) {
      throw new Error('Invalid Telegram API response');
    }

    return { messageId: data.result.message_id };
  }

  private async getUpdates(offset: number): Promise<TelegramUpdate[]> {
    if (!this.baseUrl) return [];

    const url = `${this.baseUrl}/getUpdates?offset=${offset}&timeout=30`;
    const res = await fetch(url);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Telegram getUpdates error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
    if (!data.ok || !Array.isArray(data.result)) {
      return [];
    }

    return data.result;
  }
}
