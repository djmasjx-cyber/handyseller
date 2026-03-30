import { Injectable } from '@nestjs/common';

const REDACT_KEYS = ['token', 'secret', 'password', 'authorization', 'apiKey', 'cookie'];

function sanitizeContext(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeContext(item));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (REDACT_KEYS.some((k) => lower.includes(k.toLowerCase()))) out[key] = '[REDACTED]';
      else out[key] = sanitizeContext(item);
    }
    return out;
  }
  return value;
}

@Injectable()
export class TelegramAlertService {
  private readonly botToken: string | undefined;
  private readonly chatId: string | undefined;

  constructor() {
    this.botToken = process.env.TELEGRAM_ALERT_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_ALERT_CHAT_ID;
  }

  /** Операционные уведомления (не ошибка API): истечение токенов, cron и т.п. */
  async sendOpsNotice(message: string, context?: Record<string, unknown>): Promise<void> {
    if (!this.botToken || !this.chatId) return;

    const safeContext = context ? sanitizeContext(context) : undefined;
    const text = [
      '📋 *HandySeller (ops)*',
      '',
      message,
      '',
      safeContext ? '```' + JSON.stringify(safeContext, null, 2) + '```' : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });
    } catch (err) {
      console.error('[TelegramAlert] Ops notice failed:', err);
    }
  }

  async sendAlert(message: string, context?: Record<string, unknown>): Promise<void> {
    if (!this.botToken || !this.chatId) return;

    const safeContext = context ? sanitizeContext(context) : undefined;
    const text = [
      '🚨 *HandySeller API Error*',
      '',
      message,
      '',
      safeContext ? '```' + JSON.stringify(safeContext, null, 2) + '```' : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });
    } catch (err) {
      console.error('[TelegramAlert] Failed to send:', err);
    }
  }
}
