import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from './logger.service';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private morgan: ReturnType<typeof morgan>;

  constructor(private logger: LoggerService) {
    this.morgan = morgan(
      (tokens, req: Request, res: Response) => {
        const requestId = (req as Request & { requestId?: string }).requestId ?? '-';
        const userId = (req as Request & { user?: { id?: string } }).user?.id ?? '-';
        const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '-';
        const userAgent = req.headers['user-agent'] ?? '-';

        const message = [
          tokens.method(req, res),
          tokens.url(req, res),
          tokens.status(req, res),
          tokens['response-time'](req, res),
          'ms',
        ].join(' ');

        this.logger.info(message, {
          requestId,
          userId: userId !== '-' ? userId : undefined,
          ip: ip !== '-' ? ip : undefined,
          userAgent: userAgent !== '-' ? userAgent : undefined,
          method: tokens.method(req, res),
          url: tokens.url(req, res),
          status: tokens.status(req, res),
          responseTime: tokens['response-time'](req, res),
        });
        return '';
      },
      { stream: { write: () => {} } },
    );
  }

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    this.morgan(req, res, next);
  }
}
