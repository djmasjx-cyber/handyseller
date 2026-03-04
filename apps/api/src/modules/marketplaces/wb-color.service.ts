import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { MarketplaceAdapterFactory } from './adapters/marketplace-adapter.factory';
import { WildberriesAdapter } from './adapters/wildberries.adapter';

@Injectable()
export class WbColorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterFactory: MarketplaceAdapterFactory,
  ) {}

  /** Список цветов WB из БД (для выпадающего списка) */
  async findAll(): Promise<Array<{ id: number; name: string }>> {
    const rows = await this.prisma.wbColor.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return rows;
  }

  /** userId + linkedToUserId для доступа к маркетплейсам с привязанного аккаунта */
  private async getEffectiveUserIds(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { linkedToUserId: true },
    });
    const ids = [userId];
    if (user?.linkedToUserId && user.linkedToUserId !== userId) {
      ids.push(user.linkedToUserId);
    }
    return ids;
  }

  /**
   * Синхронизация справочника цветов WB из API.
   * Требует подключённый WB у пользователя.
   */
  async syncFromWb(userId: string): Promise<{ synced: number }> {
    const ids = await this.getEffectiveUserIds(userId);
    let conn = null;
    for (const uid of ids) {
      conn = await this.prisma.marketplaceConnection.findFirst({
        where: { userId: uid, marketplace: 'WILDBERRIES' },
      });
      if (conn) break;
    }
    if (!conn?.token) {
      throw new BadRequestException('Подключите Wildberries для синхронизации цветов.');
    }

    const config = {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken ?? undefined,
      encryptedStatsToken: conn.statsToken ?? undefined,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    };
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', config) as WildberriesAdapter;
    const colors = await adapter.getColors();

    if (colors.length === 0) {
      throw new BadRequestException(
        'WB API вернул пустой список цветов. Проверьте токен и повторите попытку.',
      );
    }

    let synced = 0;
    for (const { id, name } of colors) {
      await this.prisma.wbColor.upsert({
        where: { id },
        create: { id, name },
        update: { name },
      });
      synced++;
    }

    return { synced };
  }
}
