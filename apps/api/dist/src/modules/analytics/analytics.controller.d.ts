import { AnalyticsService } from './analytics.service';
export declare class AnalyticsController {
    private analyticsService;
    constructor(analyticsService: AnalyticsService);
    getSummary(userId: string): Promise<{
        productsCount: number;
        ordersCount: number;
    }>;
    getProducts(userId: string, from?: string, to?: string): Promise<import("./analytics.service").ProductAnalyticsRow[]>;
}
