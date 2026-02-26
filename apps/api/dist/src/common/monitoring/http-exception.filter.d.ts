import { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { SentryService } from './sentry.service';
import { TelegramAlertService } from './telegram-alert.service';
import { LoggerService } from '../logger/logger.service';
export declare class AllExceptionsFilter implements ExceptionFilter {
    private sentry;
    private telegram;
    private appLogger;
    private readonly logger;
    constructor(sentry: SentryService, telegram: TelegramAlertService, appLogger: LoggerService);
    catch(exception: unknown, host: ArgumentsHost): Promise<void>;
}
