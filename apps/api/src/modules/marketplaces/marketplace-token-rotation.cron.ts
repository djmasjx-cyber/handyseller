import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';
import { TelegramAlertService } from '../../common/monitoring/telegram-alert.service';

const EXPIRING_IN_DAYS = 7;

@Injectable()
export class MarketplaceTokenRotationCron {
  private readonly logger = new Logger(MarketplaceTokenRotationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramAlertService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async checkExpiringMarketplaceTokens() {
    if (process.env.MARKETPLACE_EXPIRY_CRON_DISABLED === '1') return;

    const now = new Date();
    const threshold = new Date(now.getTime() + EXPIRING_IN_DAYS * 24 * 60 * 60 * 1000);

    const [expiring, expired] = await Promise.all([
      this.prisma.marketplaceConnection.findMany({
        where: {
          expiresAt: {
            gte: now,
            lte: threshold,
          },
        },
        select: {
          userId: true,
          marketplace: true,
          expiresAt: true,
        },
        take: 200,
      }),
      this.prisma.marketplaceConnection.findMany({
        where: {
          expiresAt: { lt: now },
        },
        select: {
          userId: true,
          marketplace: true,
          expiresAt: true,
        },
        take: 200,
      }),
    ]);

    if (expiring.length === 0 && expired.length === 0) return;

    this.logger.warn('Marketplace token expiry scan', {
      expiringCount: expiring.length,
      expiredCount: expired.length,
      windowDays: EXPIRING_IN_DAYS,
      expiringSamples: expiring.slice(0, 5),
      expiredSamples: expired.slice(0, 5),
    });

    const telegramEnabled = process.env.TELEGRAM_MARKETPLACE_ALERTS !== '0';
    if (!telegramEnabled) return;

    const lines: string[] = [];
    lines.push('Маркетплейсы: проверка сроков токенов (cron 01:00 UTC).');
    if (expiring.length > 0) {
      lines.push(
        `Истекают в течение ${EXPIRING_IN_DAYS} дней: *${expiring.length}* подключений. Продавцам: обновить токен в ЛК МП и переподключить в HandySeller.`,
      );
    }
    if (expired.length > 0) {
      lines.push(
        `Уже *истекли*: *${expired.length}* подключений — синхронизация может не работать до обновления доступа.`,
      );
    }
    lines.push('Детали — только userId + marketplace (без секретов).');

    await this.telegram.sendOpsNotice(lines.join('\n'), {
      expiring: expiring.slice(0, 20).map((r) => ({
        userId: r.userId,
        marketplace: r.marketplace,
        expiresAt: r.expiresAt?.toISOString(),
      })),
      expired: expired.slice(0, 20).map((r) => ({
        userId: r.userId,
        marketplace: r.marketplace,
        expiresAt: r.expiresAt?.toISOString(),
      })),
    });
  }
}
