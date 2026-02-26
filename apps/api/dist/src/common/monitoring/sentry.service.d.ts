import { OnModuleDestroy } from '@nestjs/common';
export declare class SentryService implements OnModuleDestroy {
    onModuleDestroy(): void;
    captureException(error: Error, context?: Record<string, unknown>): void;
    captureMessage(message: string, level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug', context?: Record<string, unknown>): void;
}
