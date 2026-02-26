import { PrismaService } from '../../common/database/prisma.service';
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
export declare class AnalyticsService {
    private prisma;
    constructor(prisma: PrismaService);
    getSummary(userId: string): Promise<{
        productsCount: number;
        ordersCount: number;
    }>;
    getProductStats(userId: string, from?: Date, to?: Date): Promise<ProductAnalyticsRow[]>;
}
