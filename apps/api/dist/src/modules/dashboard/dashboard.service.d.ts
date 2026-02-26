import { PrismaService } from '../../common/database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { MarketplacesService } from '../marketplaces/marketplaces.service';
import { CryptoService } from '../../common/crypto/crypto.service';
export declare class DashboardService {
    private prisma;
    private ordersService;
    private marketplacesService;
    private crypto;
    constructor(prisma: PrismaService, ordersService: OrdersService, marketplacesService: MarketplacesService, crypto: CryptoService);
    getDashboard(userId: string, roleFromJwt?: string): Promise<{
        userName: string | null;
        summary: {
            totalProducts: number;
            totalProductsInCatalog: number;
            totalProductsOnMarketplaces: number;
            totalRevenue: number;
            totalOrders: number;
            newOrdersCount: number;
            ordersRequireAttention: number;
            connectedMarketplaces: number;
            marketplaceLabel: string;
            isAdmin: boolean;
            monthlyRevenue: number | undefined;
        };
        statistics: Record<string, {
            totalOrders: number;
            delivered: number;
            cancelled: number;
            revenue: number;
            linkedProductsCount: number;
        }>;
        orders: {
            id: string;
            marketplaceOrderId: string;
            productId: string;
            productName: string | undefined;
            customerName: undefined;
            status: string;
            amount: number;
            createdAt: string;
            marketplace: string;
        }[];
    }>;
    private getDashboardData;
    private getMonthlyPaymentRevenue;
    private countActiveProducts;
    private since30Days;
    private getMarketplaceLabels;
}
