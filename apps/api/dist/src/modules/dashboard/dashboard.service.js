"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const orders_service_1 = require("../orders/orders.service");
const marketplaces_service_1 = require("../marketplaces/marketplaces.service");
const crypto_service_1 = require("../../common/crypto/crypto.service");
let DashboardService = class DashboardService {
    constructor(prisma, ordersService, marketplacesService, crypto) {
        this.prisma = prisma;
        this.ordersService = ordersService;
        this.marketplacesService = marketplacesService;
        this.crypto = crypto;
    }
    async getDashboard(userId, roleFromJwt) {
        try {
            return await this.getDashboardData(userId, roleFromJwt);
        }
        catch (e) {
            console.error('[Dashboard] getDashboard:', e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : '');
            throw e;
        }
    }
    async getDashboardData(userId, roleFromJwt) {
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
            this.prisma.product.count({ where: { userId } }).catch((e) => {
                console.warn('[Dashboard] product.count:', e instanceof Error ? e.message : String(e));
                return 0;
            }),
            this.marketplacesService.getUserMarketplaces(userId).catch((e) => {
                console.warn('[Dashboard] getUserMarketplaces:', e instanceof Error ? e.message : String(e));
                return [];
            }),
            this.prisma.order.findMany({
                where: { userId },
                include: { items: { include: { product: true } } },
                orderBy: { createdAt: 'desc' },
                take: 50,
            }).catch((e) => {
                console.warn('[Dashboard] order.findMany:', e instanceof Error ? e.message : String(e));
                return [];
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
                return { byMarketplace: {}, totalUnique: 0 };
            }),
            this.marketplacesService.getOrdersStatsByMarketplace(userId, monthStart, monthEnd).catch((e) => {
                console.warn('[Dashboard] getOrdersStatsByMarketplace:', e instanceof Error ? e.message : String(e));
                return {};
            }),
        ]);
        this.ordersService.syncFromMarketplaces(userId, since).catch((e) => {
            console.warn('[Dashboard] Sync фоново:', e instanceof Error ? e.message : String(e));
        });
        const isAdmin = user?.role === 'ADMIN' || roleFromJwt === 'ADMIN';
        let userName = null;
        try {
            userName = user?.name ? this.crypto.decryptOptional(user.name) : null;
        }
        catch (e) {
            console.warn('[Dashboard] decryptOptional:', e instanceof Error ? e.message : String(e));
        }
        const mpSet = new Set(connections.map((c) => c.type));
        const mpLabels = this.getMarketplaceLabels(Array.from(mpSet));
        const totalRevenue = Number(monthlyAgg._sum.totalAmount ?? 0);
        const ordersInPeriodCount = monthlyAgg._count;
        const { newCount } = await this.ordersService.getOrderStats(userId);
        const totalProductsOnMarketplaces = linkedStats.totalUnique ?? 0;
        const statistics = {};
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
        for (const mp of mpSet) {
            const key = mp.toLowerCase();
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
    async getMonthlyPaymentRevenue() {
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
        }
        catch (e) {
            console.warn('[Dashboard] getMonthlyPaymentRevenue:', e instanceof Error ? e.message : String(e));
            return 0;
        }
    }
    async countActiveProducts(userId) {
        return this.prisma.product.count({
            where: { userId, stock: { gt: 0 } },
        });
    }
    since30Days() {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d;
    }
    getMarketplaceLabels(markets) {
        const labels = {
            WILDBERRIES: 'Wildberries',
            OZON: 'Ozon',
            YANDEX: 'Яндекс',
            AVITO: 'Avito',
        };
        return markets.map((m) => labels[m] ?? m).join(', ') || 'Нет подключений';
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        orders_service_1.OrdersService,
        marketplaces_service_1.MarketplacesService,
        crypto_service_1.CryptoService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map