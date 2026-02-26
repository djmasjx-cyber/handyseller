import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';
import { OrdersService } from './orders.service';

/**
 * Автоматический переход NEW → IN_PROGRESS после истечения холда (1 час).
 * Условия: holdUntil <= now, положительный остаток по всем позициям заказа.
 * Резервирует остаток, отправляет -1 на маркетплейсы, переводит в «На сборке».
 */
@Injectable()
export class OrdersHoldTransitionCron {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
  ) {}

  @Cron('*/5 * * * *') // каждые 5 минут
  async handleCron() {
    const connections = await this.prisma.marketplaceConnection.findMany({
      where: { token: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    });

    for (const { userId } of connections) {
      try {
        const result = await this.ordersService.processHoldExpiredOrders(userId);
        if (result.processed > 0 || result.errors.length > 0) {
          console.log(
            `[OrdersHoldTransitionCron] user ${userId}: processed=${result.processed}, skipped=${result.skipped}`,
          );
          if (result.errors.length > 0) {
            console.warn(`[OrdersHoldTransitionCron] errors:`, result.errors.slice(0, 5));
          }
        }
      } catch (err) {
        console.error(`[OrdersHoldTransitionCron] Ошибка для user ${userId}:`, err);
      }
    }
  }
}
