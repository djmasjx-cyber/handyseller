import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class PaymentsWebhookGuard implements CanActivate {
    private config;
    constructor(config: ConfigService);
    canActivate(_context: ExecutionContext): boolean;
}
