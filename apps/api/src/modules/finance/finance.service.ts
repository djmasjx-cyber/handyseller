import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { ProductFinanceRow } from './dto/product-finance-row.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Возвращает таблицу unit-экономики по всем активным товарам пользователя.
   * Для каждого товара — себестоимость, цена и все комиссии из снапшота.
   * scheme — опциональный фильтр ('FBO' | 'FBS'). Если не указан — возвращаем все схемы.
   */
  async getProductFinanceTable(userId: string, scheme?: string): Promise<ProductFinanceRow[]> {
    const products = await this.prisma.product.findMany({
      where: { userId, archivedAt: null },
      select: {
        id: true,
        displayId: true,
        title: true,
        article: true,
        imageUrl: true,
        cost: true,
        price: true,
        commissions: {
          where: scheme ? { scheme } : undefined,
          orderBy: [{ marketplace: 'asc' }, { scheme: 'asc' }],
        },
      },
      orderBy: { displayId: 'asc' },
    });

    return products.map((p) => ({
      productId: p.id,
      displayId: p.displayId,
      title: p.title,
      article: p.article ?? null,
      imageUrl: p.imageUrl ?? null,
      cost: Number(p.cost ?? 0),
      price: p.price != null ? Number(p.price) : null,
      commissions: p.commissions.map((c) => ({
        marketplace: c.marketplace,
        scheme: c.scheme,
        salesCommissionPct: Number(c.salesCommissionPct),
        salesCommissionAmt: Number(c.salesCommissionAmt),
        logisticsAmt: Number(c.logisticsAmt),
        firstMileAmt: Number(c.firstMileAmt),
        returnAmt: Number(c.returnAmt),
        acceptanceAmt: Number(c.acceptanceAmt),
        totalFeeAmt: Number(c.totalFeeAmt),
        syncedAt: c.syncedAt?.toISOString() ?? null,
      })),
    }));
  }

  /**
   * Обновляет себестоимость товара (Product.cost) по ID.
   * Используется при inline-редактировании в таблице Финансы.
   */
  async updateProductCost(userId: string, productId: string, cost: number): Promise<void> {
    await this.prisma.product.updateMany({
      where: { id: productId, userId },
      data: { cost },
    });
  }
}
