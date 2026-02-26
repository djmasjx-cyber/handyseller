import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { WildberriesAdapter } from './adapters/wildberries.adapter';

@Injectable()
export class WbSupplyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Получить активную поставку (без создания). */
  async getActiveSupply(userId: string) {
    return this.prisma.wbSupply.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Получить или создать активную поставку WB для продавца.
   * Используется только для FBS-заказов.
   */
  async getOrCreateActiveSupply(userId: string, adapter: WildberriesAdapter) {
    const existing = await this.prisma.wbSupply.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    let supplyId: string | null;
    try {
      supplyId = await adapter.ensureFbsSupply();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(
        `WB: не удалось создать или получить активную поставку для FBS-заказов. ${msg}`,
      );
    }
    if (!supplyId) {
      throw new InternalServerErrorException(
        'WB: не удалось создать или получить активную поставку для FBS-заказов.',
      );
    }

    const supply = await this.prisma.wbSupply.upsert({
      where: {
        userId_wbSupplyId: {
          userId,
          wbSupplyId: supplyId,
        },
      },
      create: {
        userId,
        wbSupplyId: supplyId,
        status: 'ACTIVE',
      },
      update: {
        status: 'ACTIVE',
      },
    });

    return supply;
  }
}

