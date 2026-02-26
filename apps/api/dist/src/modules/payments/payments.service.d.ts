import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { VtbPaymentService } from './vtb-payment.service';
export declare class PaymentsService {
    private prisma;
    private vtb;
    private crypto;
    constructor(prisma: PrismaService, vtb: VtbPaymentService, crypto: CryptoService);
    createForSubscription(params: {
        userId: string;
        subscriptionId: string;
        amount: number;
        targetPlan: 'PROFESSIONAL' | 'BUSINESS';
        returnUrl: string;
        failUrl: string;
        idempotencyKey?: string;
    }): Promise<{
        paymentId: string;
        id: string;
        amount: number;
        status: string;
        vtbOrderId: string | null;
    } | {
        paymentId: string;
        formUrl: string;
        vtbOrderId: string;
    }>;
    getStatus(paymentId: string, userId?: string): Promise<{
        paymentId: string;
        id: string;
        amount: number;
        status: string;
        vtbOrderId: string | null;
    } | null>;
    private handlePaymentSuccess;
    findByIdForAdmin(paymentId: string): Promise<{
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
    } | null>;
    getStatsForAdmin(): Promise<{
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
    findAllForAdmin(opts?: {
        skip?: number;
        take?: number;
    }): Promise<{
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
    findAllWebhooksForAdmin(opts?: {
        skip?: number;
        take?: number;
    }): Promise<{
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
    refund(paymentId: string, amount?: number): Promise<{
        refunded: number;
    }>;
    handleVtbWebhook(params: {
        body: unknown;
        ip?: string;
        headers?: Record<string, string>;
    }): Promise<void>;
    private extractVtbOrderId;
    private isSuccessPayload;
    private formatPayment;
}
