import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrdersService } from './orders.service';

/**
 * Слушает событие обновления statsToken (WB ФБО) и сразу запускает синк заказов,
 * чтобы подтянуть заказы ФБО без ожидания следующего cron (5 мин).
 */
@Injectable()
export class OrdersStatsTokenSyncListener {
  constructor(private readonly ordersService: OrdersService) {}

  @OnEvent('marketplace.wbStatsTokenUpdated')
  async handleStatsTokenUpdated(payload: { userId: string }) {
    const { userId } = payload;
    try {
      const result = await this.ordersService.syncFromMarketplaces(userId);
      console.log(`[OrdersStatsTokenSyncListener] Синк заказов после обновления statsToken (user ${userId}):`, result);
    } catch (err) {
      console.error(`[OrdersStatsTokenSyncListener] Ошибка синка для user ${userId}:`, err);
    }
  }
}
