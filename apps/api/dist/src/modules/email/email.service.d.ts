import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../common/logger/logger.service';
export declare class EmailService {
    private config;
    private logger;
    private transporter;
    private resend;
    private readonly from;
    private readonly isConfigured;
    private etherealPromise;
    constructor(config: ConfigService, logger: LoggerService);
    private ensureEthereal;
    sendVerificationCode(email: string, code: string): Promise<boolean>;
}
