import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';
import { CommissionSyncService } from './commission-sync.service';

/**
 * Ежедневная синхронизация комиссий и тарифов маркетплейсов.
 * Запускается в 03:00 — вне часов-пик, после ночного обновления тарифов Ozon/WB.
 */
@Injectable()
export class CommissionSyncCron {
  private readonly logger = new Logger(CommissionSyncCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commissionSyncService: CommissionSyncService,
  ) {}

  @Cron('0 3 * * *', { name: 'commission-sync' })
  async syncAllUsers() {
    if (process.env.COMMISSION_SYNC_CRON_DISABLED === '1') return;

    this.logger.log('[CommissionSyncCron] Запуск ежедневной синхронизации тарифов');

    // Получаем всех уникальных пользователей с активными подключениями к маркетплейсам
    const connections = await this.prisma.marketplaceConnection.findMany({
      where: { marketplace: { in: ['OZON', 'WILDBERRIES'] } },
      select: { userId: true, marketplace: true },
      distinct: ['userId', 'marketplace'],
    });

    const userIds = [...new Set(connections.map((c) => c.userId))];
    this.logger.log(`[CommissionSyncCron] Пользователей для синхронизации: ${userIds.length}`);

    let totalOzon = 0;
    let totalWb = 0;
    let errors = 0;

    for (const userId of userIds) {
      try {
        const result = await this.commissionSyncService.syncForUser(userId);
        totalOzon += result.ozon;
        totalWb += result.wb;
      } catch (e) {
        errors++;
        this.logger.warn(
          `[CommissionSyncCron] Ошибка для userId=${userId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    this.logger.log(
      `[CommissionSyncCron] Готово. Ozon: ${totalOzon}, WB: ${totalWb}, Ошибок: ${errors}`,
    );
  }
}
