import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { OrderStatus } from '@prisma/client';

export interface ProductMarketplaceStats {
  revenue: number;
  orders: number;
  delivered: number;
}

export interface ProductAnalyticsRow {
  productId: string;
  title: string;
  article: string | null;
  imageUrl: string | null;
  stock: number;
  byMarketplace: Record<string, ProductMarketplaceStats>;
  totalRevenue: number;
  totalOrders: number;
  totalDelivered: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(userId: string) {
    const [productsCount, ordersCount] = await Promise.all([
      this.prisma.product.count({ where: { userId } }),
      this.prisma.order.count({ where: { userId } }),
    ]);
    return { productsCount, ordersCount };
  }

  /**
   * Агрегаты по товарам за период (по умолчанию — текущий календарный месяц).
   * Источник: заказы в БД (Order + OrderItem). Выручка = сумма totalAmount по заказам.
   */
  async getProductStats(
    userId: string,
    from?: Date,
    to?: Date,
  ): Promise<ProductAnalyticsRow[]> {
    const now = new Date();
    const fromDate = from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const orders = await this.prisma.order.findMany({
      where: {
        userId,
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        marketplace: true,
        status: true,
        totalAmount: true,
        items: {
          select: {
            productId: true,
            product: {
              select: {
                id: true,
                title: true,
                article: true,
                imageUrl: true,
                stock: true,
              },
            },
          },
        },
      },
    });

    const byProduct = new Map<
      string,
      {
        product: { id: string; title: string; article: string | null; imageUrl: string | null; stock: number };
        byMarketplace: Record<string, { revenue: number; orders: number; delivered: number }>;
      }
    >();

    for (const order of orders) {
      const amount = Number(order.totalAmount);
      const marketplace = order.marketplace;
      const isDelivered = order.status === OrderStatus.DELIVERED;
      const firstItem = order.items[0];
      if (!firstItem?.product) continue;
      const pid = firstItem.productId;
      const product = firstItem.product;

      if (!byProduct.has(pid)) {
        byProduct.set(pid, {
          product: {
            id: product.id,
            title: product.title,
            article: product.article,
            imageUrl: product.imageUrl,
            stock: product.stock ?? 0,
          },
          byMarketplace: {},
        });
      }
      const row = byProduct.get(pid)!;
      if (!row.byMarketplace[marketplace]) {
        row.byMarketplace[marketplace] = { revenue: 0, orders: 0, delivered: 0 };
      }
      const mp = row.byMarketplace[marketplace];
      mp.revenue += amount;
      mp.orders += 1;
      if (isDelivered) mp.delivered += 1;
    }

    const result: ProductAnalyticsRow[] = [];
    for (const [, data] of byProduct) {
      let totalRevenue = 0;
      let totalOrders = 0;
      let totalDelivered = 0;
      for (const st of Object.values(data.byMarketplace)) {
        totalRevenue += st.revenue;
        totalOrders += st.orders;
        totalDelivered += st.delivered;
      }
      result.push({
        productId: data.product.id,
        title: data.product.title,
        article: data.product.article,
        imageUrl: data.product.imageUrl,
        stock: data.product.stock,
        byMarketplace: data.byMarketplace,
        totalRevenue,
        totalOrders,
        totalDelivered,
      });
    }

    result.sort((a, b) => b.totalRevenue - a.totalRevenue);
    return result;
  }
}
