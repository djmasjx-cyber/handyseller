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
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const client_1 = require("@prisma/client");
let AnalyticsService = class AnalyticsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getSummary(userId) {
        const [productsCount, ordersCount] = await Promise.all([
            this.prisma.product.count({ where: { userId } }),
            this.prisma.order.count({ where: { userId } }),
        ]);
        return { productsCount, ordersCount };
    }
    async getProductStats(userId, from, to) {
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
        const byProduct = new Map();
        for (const order of orders) {
            const amount = Number(order.totalAmount);
            const marketplace = order.marketplace;
            const isDelivered = order.status === client_1.OrderStatus.DELIVERED;
            const firstItem = order.items[0];
            if (!firstItem?.product)
                continue;
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
            const row = byProduct.get(pid);
            if (!row.byMarketplace[marketplace]) {
                row.byMarketplace[marketplace] = { revenue: 0, orders: 0, delivered: 0 };
            }
            const mp = row.byMarketplace[marketplace];
            mp.revenue += amount;
            mp.orders += 1;
            if (isDelivered)
                mp.delivered += 1;
        }
        const result = [];
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
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map