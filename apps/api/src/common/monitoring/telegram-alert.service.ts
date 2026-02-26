import { Injectable } from '@nestjs/common';

@Injectable()
export class TelegramAlertService {
  private readonly botToken: string | undefined;
  private readonly chatId: string | undefined;

  constructor() {
    this.botToken = process.env.TELEGRAM_ALERT_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_ALERT_CHAT_ID;
  }

  async sendAlert(message: string, context?: Record<string, unknown>): Promise<void> {
    if (!this.botToken || !this.chatId) return;

    const text = [
      '🚨 *HandySeller API Error*',
      '',
      message,
      '',
      context ? '```' + JSON.stringify(context, null, 2) + '```' : '',
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
