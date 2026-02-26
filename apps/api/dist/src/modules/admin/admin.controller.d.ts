import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MarketplacesService } from '../marketplaces/marketplaces.service';
import { OrdersService } from '../orders/orders.service';
import { RefundPaymentDto } from '../payments/dto/refund-payment.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
export declare class AdminController {
    private usersService;
    private paymentsService;
    private subscriptionsService;
    private marketplacesService;
    private ordersService;
    constructor(usersService: UsersService, paymentsService: PaymentsService, subscriptionsService: SubscriptionsService, marketplacesService: MarketplacesService, ordersService: OrdersService);
    updateUserSubscription(userId: string, dto: UpdateSubscriptionDto): Promise<{
        id: string;
        userId: string;
        externalId: string | null;
        createdAt: Date;
        updatedAt: Date;
        expiresAt: Date | null;
        plan: import(".prisma/client").$Enums.SubscriptionPlan;
    }>;
    getUsers(skip?: string, take?: string): Promise<{
        users: {
            ordersCount: number;
            productsCount: number;
            plan: import(".prisma/client").$Enums.SubscriptionPlan;
            subscriptionExpiresAt: Date | null;
            id: string;
            createdAt: Date;
            email: string | null;
            name: string | null;
            role: import(".prisma/client").$Enums.Role;
            isActive: boolean;
        }[];
        total: number;
    }>;
    getPaymentsStats(): Promise<{
        payments: {
            total: number;
            succeeded: number;
            failed: number;
            processing: number;
            refunded: number;
        };
        revenue: number;
        revenueCount: number;
        monthlyRevenue: number;
        monthlyRevenueCount: number;
        refundedTotal: number;
        refundedCount: number;
        webhooksUnprocessed: number;
    }>;
    getPaymentsWebhooks(skip?: string, take?: string): Promise<{
        webhooks: {
            id: string;
            eventType: string;
            vtbOrderId: string | null;
            paymentId: string | null;
            processed: boolean;
            processingError: string | null;
            ipAddress: string | null;
            createdAt: string;
            payload: import("@prisma/client/runtime/library").JsonValue;
        }[];
        total: number;
    }>;
    getPaymentById(id: string): Promise<{
        payment: null;
    } | {
        payment: {
            id: string;
            userId: string;
            userEmail: string | null;
            userName: string | null;
            amount: number;
            status: import(".prisma/client").$Enums.PaymentStatus;
            subjectType: string;
            subjectId: string;
            vtbOrderId: string | null;
            paymentMethod: string | null;
            refundable: boolean;
            refundedAmount: number;
            idempotencyKey: string | null;
            createdAt: string;
            updatedAt: string;
        };
    }>;
    debugWbOrder(email: string, orderId: string, doSync?: string): Promise<{
        error: string;
        wb?: undefined;
        ourDb?: undefined;
        mappedStatus?: undefined;
    } | {
        wb: {
            found: boolean;
            orderId?: number;
            srid?: string;
            wbStatus?: string;
            supplierStatus?: string;
            orderStatus?: string | number;
            raw?: Record<string, unknown>;
        };
        ourDb: {
            id: string;
            externalId: string;
            status: import(".prisma/client").$Enums.OrderStatus;
            rawStatus: string | null;
            wbStickerNumber: string | null;
        } | null;
        mappedStatus: string | null;
        error?: undefined;
    } | {
        error: string;
        email: string;
    } | {
        syncResult: {
            synced: number;
            skipped: number;
            errors: string[];
        };
        error: string;
        wb?: undefined;
        ourDb?: undefined;
        mappedStatus?: undefined;
        email?: undefined;
    } | {
        syncResult: {
            synced: number;
            skipped: number;
            errors: string[];
        };
        wb: {
            found: boolean;
            orderId?: number;
            srid?: string;
            wbStatus?: string;
            supplierStatus?: string;
            orderStatus?: string | number;
            raw?: Record<string, unknown>;
        };
        ourDb: {
            id: string;
            externalId: string;
            status: import(".prisma/client").$Enums.OrderStatus;
            rawStatus: string | null;
            wbStickerNumber: string | null;
        } | null;
        mappedStatus: string | null;
        error?: undefined;
        email?: undefined;
    }>;
    getPayments(skip?: string, take?: string): Promise<{
        payments: {
            id: string;
            userId: string;
            userEmail: string | null;
            userName: string | null;
            amount: number;
            status: import(".prisma/client").$Enums.PaymentStatus;
            subjectType: string;
            subjectId: string;
            vtbOrderId: string | null;
            createdAt: string;
        }[];
        total: number;
    }>;
    retryStockReserve(externalId?: string, orderId?: string): Promise<{
        ok: boolean;
        reserved: number;
        message?: string;
    }>;
    refundPayment(paymentId: string, dto: RefundPaymentDto): Promise<{
        refunded: number;
    }>;
}
