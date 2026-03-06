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
