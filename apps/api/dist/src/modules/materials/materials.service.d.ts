import { PrismaService } from '../../common/database/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
export declare class MaterialsService {
    private prisma;
    private subscriptionsService;
    constructor(prisma: PrismaService, subscriptionsService: SubscriptionsService);
    findAll(userId: string): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        cost: import("@prisma/client/runtime/library").Decimal;
        unit: string;
    }[]>;
    create(userId: string, data: {
        name: string;
        cost: number;
        unit?: string;
    }): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        cost: import("@prisma/client/runtime/library").Decimal;
        unit: string;
    }>;
}
