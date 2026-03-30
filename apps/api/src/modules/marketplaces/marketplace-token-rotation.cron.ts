import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';

const EXPIRING_IN_DAYS = 7;

@Injectable()
export class MarketplaceTokenRotationCron {
  private readonly logger = new Logger(MarketplaceTokenRotationCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async checkExpiringMarketplaceTokens() {
    const now = new Date();
    const threshold = new Date(now.getTime() + EXPIRING_IN_DAYS * 24 * 60 * 60 * 1000);
    const expiring = await this.prisma.marketplaceConnection.findMany({
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
    });

    if (expiring.length === 0) return;

    this.logger.warn('Marketplace tokens are close to expiry', {
      count: expiring.length,
      windowDays: EXPIRING_IN_DAYS,
      samples: expiring.slice(0, 5),
    });
  }
}
