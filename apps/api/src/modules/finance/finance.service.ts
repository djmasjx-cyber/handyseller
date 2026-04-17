import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { ProductFinanceRow } from './dto/product-finance-row.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  private mapProductFinanceRow(
    p: {
      id: string;
      displayId: number;
      title: string;
      article: string | null;
      imageUrl: string | null;
      cost: unknown;
      commissions: Array<{
        marketplace: string;
        scheme: string;
        marketplacePrice: unknown;
        salesCommissionPct: unknown;
        salesCommissionAmt: unknown;
        logisticsAmt: unknown;
        firstMileAmt: unknown;
        returnAmt: unknown;
        acceptanceAmt: unknown;
        totalFeeAmt: unknown;
        syncedAt: Date | null;
        rawData: unknown;
      }>;
    },
  ): ProductFinanceRow {
    return {
      productId: p.id,
      displayId: p.displayId,
      title: p.title,
      article: p.article ?? null,
      imageUrl: p.imageUrl ?? null,
      cost: Number(p.cost ?? 0),
      commissions: p.commissions.map((c) => {
        const raw = c.rawData as Record<string, unknown> | null;
        const storageCostPerDay =
          typeof raw?.storageCostPerDay === 'number' ? raw.storageCostPerDay : 0;
        return {
          marketplace: c.marketplace,
          scheme: c.scheme,
          marketplacePrice: Number(c.marketplacePrice ?? 0),
          salesCommissionPct: Number(c.salesCommissionPct),
          salesCommissionAmt: Number(c.salesCommissionAmt),
          logisticsAmt: Number(c.logisticsAmt),
          firstMileAmt: Number(c.firstMileAmt),
          returnAmt: Number(c.returnAmt),
          acceptanceAmt: Number(c.acceptanceAmt),
          totalFeeAmt: Number(c.totalFeeAmt),
          storageCostPerDay,
          syncedAt: c.syncedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  /**
   * Возвращает таблицу unit-экономики по всем активным товарам пользователя.
   * Для каждого товара — себестоимость, цена и все комиссии из снапшота.
   * scheme — опциональный фильтр ('FBO' | 'FBS'). Если не указан — возвращаем все схемы.
   */
  async getProductFinanceTable(
    userId: string,
    scheme?: string,
    includeEmpty = false,
  ): Promise<ProductFinanceRow[]> {
    const where = scheme && !includeEmpty
      ? { userId, archivedAt: null, commissions: { some: { scheme } } }
      : { userId, archivedAt: null };
    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        displayId: true,
        title: true,
        article: true,
        imageUrl: true,
        cost: true,
        commissions: {
          where: scheme ? { scheme } : undefined,
          select: {
            marketplace: true,
            scheme: true,
            marketplacePrice: true,
            salesCommissionPct: true,
            salesCommissionAmt: true,
            logisticsAmt: true,
            firstMileAmt: true,
            returnAmt: true,
            acceptanceAmt: true,
            totalFeeAmt: true,
            syncedAt: true,
            rawData: true,
          },
          orderBy: [{ marketplace: 'asc' }, { scheme: 'asc' }],
        },
      },
      orderBy: { displayId: 'asc' },
    });

    return products.map((p) => this.mapProductFinanceRow(p));
  }

  async getProductFinanceTablePaged(
    userId: string,
    params: { scheme?: string; limit?: number; offset?: number; includeEmpty?: boolean },
  ): Promise<{ items: ProductFinanceRow[]; total: number; offset: number; limit: number; hasMore: boolean }> {
    const scheme = params.scheme;
    const includeEmpty = params.includeEmpty === true;
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);

    const where = scheme && !includeEmpty
      ? { userId, archivedAt: null, commissions: { some: { scheme } } }
      : { userId, archivedAt: null };
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          displayId: true,
          title: true,
          article: true,
          imageUrl: true,
          cost: true,
          commissions: {
            where: scheme ? { scheme } : undefined,
            select: {
              marketplace: true,
              scheme: true,
              marketplacePrice: true,
              salesCommissionPct: true,
              salesCommissionAmt: true,
              logisticsAmt: true,
              firstMileAmt: true,
              returnAmt: true,
              acceptanceAmt: true,
              totalFeeAmt: true,
              syncedAt: true,
              rawData: true,
            },
            orderBy: [{ marketplace: 'asc' }, { scheme: 'asc' }],
          },
        },
        orderBy: { displayId: 'asc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: products.map((p) => this.mapProductFinanceRow(p)),
      total,
      offset,
      limit,
      hasMore: offset + products.length < total,
    };
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
