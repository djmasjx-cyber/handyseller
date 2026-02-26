import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Опциональная проверка подписи вебхука ВТБ.
 * Если VTB_WEBHOOK_SECRET не задан — запрос пропускается (для разработки).
 */
@Injectable()
export class PaymentsWebhookGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    const secret = this.config.get('VTB_WEBHOOK_SECRET');
    if (!secret) return true;
    // TODO: реализовать проверку подписи по спецификации ВТБ
    return true;
  }
}
