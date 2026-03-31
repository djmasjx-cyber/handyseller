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

  /** Выручка и заказы за последние 3 календарных месяца (текущий, предыдущий, предпредыдущий). */
  async getMonthlyBreakdown(userId: string): Promise<
    Array<{
      month: string;
      year: number;
      revenue: number;
      orders: number;
      byMarketplace: Record<string, { revenue: number; orders: number }>;
    }>
  > {
    const now = new Date();
    const months: Array<{ from: Date; to: Date; monthName: string; year: number }> = [];
    for (let i = 0; i < 3; i++) {
      const y = now.getFullYear();
      const m = now.getMonth() - i;
      const year = m >= 0 ? y : y - 1;
      const month = m >= 0 ? m : m + 12;
      months.push({
        from: new Date(year, month, 1),
        to: new Date(year, month + 1, 0, 23, 59, 59),
        monthName: this.getMonthName(month),
        year,
      });
    }
    const results = await Promise.all(
      months.map(async ({ from, to, monthName, year }) => {
        const where = {
          userId,
          createdAt: { gte: from, lte: to },
          status: { not: OrderStatus.CANCELLED },
        } as const;

        const [agg, byMp] = await Promise.all([
          this.prisma.order.aggregate({
            where,
            _sum: { totalAmount: true },
            _count: true,
          }),
          this.prisma.order.groupBy({
            by: ['marketplace'],
            where,
            _sum: { totalAmount: true },
            _count: true,
          }),
        ]);

        const byMarketplace: Record<string, { revenue: number; orders: number }> = {};
        for (const r of byMp) {
          const key = String(r.marketplace).toLowerCase();
          byMarketplace[key] = {
            revenue: Math.round(Number(r._sum.totalAmount ?? 0) * 100) / 100,
            orders: Number(r._count) || 0,
          };
        }
        return {
          month: monthName,
          year,
          revenue: Math.round((Number(agg._sum.totalAmount ?? 0)) * 100) / 100,
          orders: agg._count,
          byMarketplace,
        };
      }),
    );
    return results;
  }

  private getMonthName(monthIndex: number): string {
    const names = [
      'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
      'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
    ];
    return names[monthIndex] ?? '';
  }

  /**
   * Агрегаты по товарам за период (по умолчанию — текущий календарный месяц).
   * Источник: все товары пользователя + заказы в БД (Order + OrderItem).
   * Выручка = сумма totalAmount по заказам.
   */
  async getProductStats(
    userId: string,
    from?: Date,
    to?: Date,
  ): Promise<ProductAnalyticsRow[]> {
    const now = new Date();
    const fromDate = from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 1. Получаем ВСЕ товары пользователя (неархивные)
    const products = await this.prisma.product.findMany({
      where: { userId, archivedAt: null },
      select: { id: true, title: true, article: true, imageUrl: true, stock: true },
    });

    // 2. Получаем заказы за период
    const orders = await this.prisma.order.findMany({
      where: {
        userId,
        createdAt: { gte: fromDate, lte: toDate },
        status: { not: OrderStatus.CANCELLED }, // Исключаем отменённые
      },
      select: {
        id: true,
        marketplace: true,
        status: true,
        totalAmount: true,
        items: { select: { productId: true } },
      },
    });

    // 3. Агрегируем статистику по товарам
    const statsByProduct = new Map<string, Record<string, { revenue: number; orders: number; delivered: number }>>();

    for (const order of orders) {
      const amount = Number(order.totalAmount);
      const marketplace = order.marketplace;
      const isDelivered = order.status === OrderStatus.DELIVERED;
      const firstItem = order.items[0];
      if (!firstItem?.productId) continue;
      const pid = firstItem.productId;

      if (!statsByProduct.has(pid)) {
        statsByProduct.set(pid, {});
      }
      const byMp = statsByProduct.get(pid)!;
      if (!byMp[marketplace]) {
        byMp[marketplace] = { revenue: 0, orders: 0, delivered: 0 };
      }
      byMp[marketplace].revenue += amount;
      byMp[marketplace].orders += 1;
      if (isDelivered) byMp[marketplace].delivered += 1;
    }

    // 4. Формируем результат для ВСЕХ товаров
    const result: ProductAnalyticsRow[] = products.map((product) => {
      const byMarketplace = statsByProduct.get(product.id) ?? {};
      let totalRevenue = 0;
      let totalOrders = 0;
      let totalDelivered = 0;
      for (const st of Object.values(byMarketplace)) {
        totalRevenue += st.revenue;
        totalOrders += st.orders;
        totalDelivered += st.delivered;
      }
      return {
        productId: product.id,
        title: product.title,
        article: product.article,
        imageUrl: product.imageUrl,
        stock: product.stock ?? 0,
        byMarketplace,
        totalRevenue,
        totalOrders,
        totalDelivered,
      };
    });

    // Сортируем по выручке (сначала товары с продажами)
    result.sort((a, b) => b.totalRevenue - a.totalRevenue);
    return result;
  }
}
