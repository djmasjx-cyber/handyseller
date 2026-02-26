import { SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
export interface SubscriptionLimits {
    maxProducts: number;
    maxMarketplaces: number;
    materialsAllowed: boolean;
}
export declare class SubscriptionsService {
    private prisma;
    constructor(prisma: PrismaService);
    findForUser(userId: string): Promise<{
        id: string;
        userId: string;
        externalId: string | null;
        createdAt: Date;
        updatedAt: Date;
        expiresAt: Date | null;
        plan: import(".prisma/client").$Enums.SubscriptionPlan;
    }>;
    updatePlan(userId: string, plan: SubscriptionPlan, expiresAt?: Date | null): Promise<{
        id: string;
        userId: string;
        externalId: string | null;
        createdAt: Date;
        updatedAt: Date;
        expiresAt: Date | null;
        plan: import(".prisma/client").$Enums.SubscriptionPlan;
    }>;
    getLimits(userId: string): Promise<SubscriptionLimits>;
}
