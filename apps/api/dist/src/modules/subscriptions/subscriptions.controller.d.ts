import { SubscriptionsService } from './subscriptions.service';
export declare class SubscriptionsController {
    private subscriptionsService;
    constructor(subscriptionsService: SubscriptionsService);
    getMe(userId: string): Promise<{
        limits: import("./subscriptions.service").SubscriptionLimits;
        id: string;
        userId: string;
        externalId: string | null;
        createdAt: Date;
        updatedAt: Date;
        expiresAt: Date | null;
        plan: import(".prisma/client").$Enums.SubscriptionPlan;
    }>;
}
