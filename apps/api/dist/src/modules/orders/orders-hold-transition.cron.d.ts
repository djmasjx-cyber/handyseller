import { PrismaService } from '../../common/database/prisma.service';
import { OrdersService } from './orders.service';
export declare class OrdersHoldTransitionCron {
    private prisma;
    private ordersService;
    constructor(prisma: PrismaService, ordersService: OrdersService);
    handleCron(): Promise<void>;
}
