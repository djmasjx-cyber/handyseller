export declare class CreatePaymentDto {
    subscriptionId: string;
    amount: number;
    targetPlan: 'PROFESSIONAL' | 'BUSINESS';
    returnUrl: string;
    failUrl: string;
    idempotencyKey?: string;
}
