import { DashboardService } from './dashboard.service';
export declare class DashboardController {
    private dashboardService;
    constructor(dashboardService: DashboardService);
    getDashboard(userId: string, role?: string): Promise<{
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
}
