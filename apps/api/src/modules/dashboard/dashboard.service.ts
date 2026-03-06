import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { MarketplacesService } from '../marketplaces/marketplaces.service';
import { CryptoService } from '../../common/crypto/crypto.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private marketplacesService: MarketplacesService,
    private crypto: CryptoService,
  ) {}

  async getDashboard(userId: string, roleFromJwt?: string) {
    try {
      return await this.getDashboardData(userId, roleFromJwt);
    } catch (e) {
      console.error('[Dashboard] getDashboard:', e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : '');
      throw e;
    }
  }

  private async getDashboardData(userId: string, roleFromJwt?: string) {
    const since = this.since30Days();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [user, activeProductsCount, totalProductsCount, connections, ordersFromDb, monthlyAgg, monthlyRevenue, linkedStats, ordersStatsByMp] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } }).catch((e) => {
        console.warn('[Dashboard] user.findUnique:', e instanceof Error ? e.message : String(e));
        return null;
      }),
      this.countActiveProducts(userId).catch((e) => {
        console.warn('[Dashboard] countActiveProducts:', e instanceof Error ? e.message : String(e));
        return 0;
      }),
      this.prisma.product.count({ where: { userId, archivedAt: null } }).catch((e) => {
        console.warn('[Dashboard] product.count:', e instanceof Error ? e.message : String(e));
        return 0;
      }),
      this.marketplacesService.getUserMarketplaces(userId).catch((e) => {
        console.warn('[Dashboard] getUserMarketplaces:', e instanceof Error ? e.message : String(e));
        return [] as Array<{ type: string }>;
      }),
      this.prisma.order.findMany({
        where: { userId },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }).catch((e) => {
        console.warn('[Dashboard] order.findMany:', e instanceof Error ? e.message : String(e));
        return [] as Array<{ status: string; id: string; externalId: string; totalAmount: unknown; createdAt: Date; marketplace: string; items: Array<{ productId: string; product?: { title: string } }> }>;
      }),
      this.prisma.order.aggregate({
        where: {
          userId,
          createdAt: { gte: since },
          status: { not: 'CANCELLED' },
        },
        _sum: { totalAmount: true },
        _count: true,
      }).catch((e) => {
        console.warn('[Dashboard] order.aggregate:', e instanceof Error ? e.message : String(e));
        return { _sum: { totalAmount: null }, _count: 0 };
      }),
      this.getMonthlyPaymentRevenue(),
      this.marketplacesService.getLinkedProductsStats(userId).catch((e) => {
        console.warn('[Dashboard] getLinkedProductsStats:', e instanceof Error ? e.message : String(e));
        return { byMarketplace: {} as Record<string, number>, totalUnique: 0 };
      }),
      this.marketplacesService.getOrdersStatsByMarketplace(userId, monthStart, monthEnd).catch((e) => {
        console.warn('[Dashboard] getOrdersStatsByMarketplace:', e instanceof Error ? e.message : String(e));
        return {} as Record<string, { totalOrders: number; delivered: number; cancelled: number; revenue: number }>;
      }),
    ]);

    this.ordersService.syncFromMarketplaces(userId, since).catch((e) => {
      console.warn('[Dashboard] Sync фоново:', e instanceof Error ? e.message : String(e));
    });

    const isAdmin = user?.role === 'ADMIN' || roleFromJwt === 'ADMIN';
    let userName: string | null = null;
    try {
      userName = user?.name ? this.crypto.decryptOptional(user.name) : null;
    } catch (e) {
      console.warn('[Dashboard] decryptOptional:', e instanceof Error ? e.message : String(e));
    }
    const mpSet = new Set(connections.map((c) => c.type));
    const mpLabels = this.getMarketplaceLabels(Array.from(mpSet));

    const totalRevenue = Number(monthlyAgg._sum.totalAmount ?? 0);
    const ordersInPeriodCount = monthlyAgg._count;
    const { newCount } = await this.ordersService.getOrderStats(userId);

    const totalProductsOnMarketplaces = linkedStats.totalUnique ?? 0;
    const statistics: Record<
      string,
      { totalOrders: number; delivered: number; cancelled: number; revenue: number; linkedProductsCount: number }
    > = {};
    for (const [key, orderStat] of Object.entries(ordersStatsByMp ?? {})) {
      statistics[key] = {
        ...orderStat,
        linkedProductsCount: linkedStats.byMarketplace?.[key] ?? 0,
      };
    }
    for (const key of Object.keys(linkedStats.byMarketplace ?? {})) {
      if (!statistics[key]) {
        statistics[key] = {
          totalOrders: 0,
          delivered: 0,
          cancelled: 0,
          revenue: 0,
          linkedProductsCount: linkedStats.byMarketplace[key] ?? 0,
        };
      }
    }
    // Всегда показывать карточки для подключённых площадок (WB, Ozon и т.д.)
    for (const mp of mpSet) {
      const key = (mp as string).toLowerCase();
      if (!statistics[key]) {
        statistics[key] = {
          totalOrders: 0,
          delivered: 0,
          cancelled: 0,
          revenue: 0,
          linkedProductsCount: linkedStats.byMarketplace?.[key] ?? 0,
        };
      }
    }

    const orders = ordersFromDb.map((o) => {
      const firstItem = o.items[0];
      return {
        id: o.id,
        marketplaceOrderId: o.externalId,
        productId: firstItem?.productId ?? '',
        productName: firstItem?.product?.title,
        customerName: undefined,
        status: o.status,
        amount: Number(o.totalAmount),
        createdAt: o.createdAt.toISOString(),
        marketplace: o.marketplace,
      };
    });

    return {
      userName,
      summary: {
        totalProducts: activeProductsCount,
        totalProductsInCatalog: totalProductsCount,
        totalProductsOnMarketplaces,
        totalRevenue,
        totalOrders: ordersInPeriodCount,
        newOrdersCount: newCount,
        ordersRequireAttention: newCount,
        connectedMarketplaces: mpSet.size,
        marketplaceLabel: mpLabels,
        isAdmin,
        monthlyRevenue: isAdmin ? Number(monthlyRevenue) : undefined,
      },
      statistics,
      orders,
    };
  }

  /** Сумма успешных платежей за текущий месяц (для админа) */
  private async getMonthlyPaymentRevenue(): Promise<number> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const result = await this.prisma.payment.aggregate({
        where: {
          status: 'SUCCEEDED',
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      });
      return Number(result._sum.amount ?? 0);
    } catch (e) {
      console.warn('[Dashboard] getMonthlyPaymentRevenue:', e instanceof Error ? e.message : String(e));
      return 0;
    }
  }

  /**
   * Активные товары: все продукты пользователя (как на странице «Мой склад»).
   * Исключаем архивные товары (archivedAt IS NULL).
   */
  private async countActiveProducts(userId: string): Promise<number> {
    return this.prisma.product.count({
      where: { userId, archivedAt: null },
    });
  }

  private since30Days(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }

  private getMarketplaceLabels(markets: string[]): string {
    const labels: Record<string, string> = {
      WILDBERRIES: 'Wildberries',
      OZON: 'Ozon',
      YANDEX: 'Яндекс',
      AVITO: 'Avito',
    };
    return markets.map((m) => labels[m] ?? m).join(', ') || 'Нет подключений';
  }
}
