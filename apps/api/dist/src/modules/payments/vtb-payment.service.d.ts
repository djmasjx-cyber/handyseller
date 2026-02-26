import { ConfigService } from '@nestjs/config';
export interface VtbRegisterParams {
    orderNumber: string;
    amount: number;
    currency?: string;
    returnUrl: string;
    failUrl: string;
    description?: string;
    email?: string;
}
export interface VtbRegisterResult {
    orderId: string;
    formUrl: string;
}
export interface VtbOrderStatus {
    orderStatus: number;
    actionCode?: number;
    orderNumber?: string;
}
export declare class VtbPaymentService {
    private config;
    private get userName();
    private get password();
    private get apiUrl();
    constructor(config: ConfigService);
    get isConfigured(): boolean;
    register(params: VtbRegisterParams): Promise<VtbRegisterResult>;
    getOrderStatus(vtbOrderId: string): Promise<VtbOrderStatus>;
    isPaid(status: VtbOrderStatus): boolean;
    refund(vtbOrderId: string, amount: number): Promise<void>;
}
