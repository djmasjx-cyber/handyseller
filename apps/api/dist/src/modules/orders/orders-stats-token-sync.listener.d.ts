import { OrdersService } from './orders.service';
export declare class OrdersStatsTokenSyncListener {
    private readonly ordersService;
    constructor(ordersService: OrdersService);
    handleStatsTokenUpdated(payload: {
        userId: string;
    }): Promise<void>;
}
