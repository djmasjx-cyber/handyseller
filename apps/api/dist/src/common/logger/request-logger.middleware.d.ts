import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggerService } from './logger.service';
declare global {
    namespace Express {
        interface Request {
            requestId?: string;
        }
    }
}
export declare class RequestLoggerMiddleware implements NestMiddleware {
    private logger;
    private morgan;
    constructor(logger: LoggerService);
    use(req: Request, res: Response, next: NextFunction): void;
}
