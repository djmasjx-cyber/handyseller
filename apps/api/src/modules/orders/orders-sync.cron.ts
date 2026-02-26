import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';
import { OrdersService } from './orders.service';

/**
 * Автоматическая синхронизация заказов с маркетплейсов каждые 5 минут.
 * Не требует нажатия кнопок — заказы и остатки обновляются в фоне.
 */
@Injectable()
export class OrdersSyncCron {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
  ) {}

  @Cron('*/5 * * * *')
  async handleCron() {
    const connections = await this.prisma.marketplaceConnection.findMany({
      where: { token: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    });

    for (const { userId } of connections) {
      try {
        await this.ordersService.syncFromMarketplaces(userId);
      } catch (err) {
        console.error(`[OrdersSyncCron] Ошибка синхронизации для user ${userId}:`, err);
      }
    }
  }
}
