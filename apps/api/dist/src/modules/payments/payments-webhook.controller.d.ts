import { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
export declare class PaymentsWebhookController {
    private paymentsService;
    constructor(paymentsService: PaymentsService);
    handleVtbWebhook(req: Request, res: Response): Promise<void>;
}
