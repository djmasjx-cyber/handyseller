import * as winston from 'winston';
export interface LogContext {
    requestId?: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
    [key: string]: unknown;
}
export declare class LoggerService {
    private logger;
    constructor();
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext): void;
    getWinston(): winston.Logger;
}
