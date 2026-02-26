import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
export declare class PaymentsController {
    private paymentsService;
    constructor(paymentsService: PaymentsService);
    create(userId: string, dto: CreatePaymentDto): Promise<{
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
    getStatus(userId: string, paymentId: string): Promise<{
        payment: null;
    } | {
        payment: {
            paymentId: string;
            id: string;
            amount: number;
            status: string;
            vtbOrderId: string | null;
        };
    }>;
}
