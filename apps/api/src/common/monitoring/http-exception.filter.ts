import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SentryService } from './sentry.service';
import { TelegramAlertService } from './telegram-alert.service';
import { LoggerService } from '../logger/logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private sentry: SentryService,
    private telegram: TelegramAlertService,
    private appLogger: LoggerService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const requestId = (req as Request & { requestId?: string }).requestId;
    const userId = (req as Request & { user?: { id?: string } }).user?.id;
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '-';
    const userAgent = req.headers['user-agent'] ?? '-';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    const context = {
      requestId,
      userId,
      ip,
      userAgent,
      path: req.url,
      method: req.method,
      status,
    };

    this.appLogger.error(message, {
      ...context,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    if (status >= 500) {
      this.sentry.captureException(
        exception instanceof Error ? exception : new Error(String(exception)),
        context,
      );
      await this.telegram.sendAlert(message, { ...context, stack: exception instanceof Error ? exception.stack : undefined });
    }

    const clientMessage =
      status >= 500 && process.env.NODE_ENV !== 'production'
        ? message
        : status >= 500
          ? 'Internal server error'
          : message;

    const base = { statusCode: status, message: clientMessage, requestId };
    const response =
      exception instanceof HttpException ? exception.getResponse() : null;
    const body =
      typeof response === 'object' && response !== null
        ? { ...base, ...(response as { [key: string]: unknown }) }
        : base;
    res.status(status).json(body);
  }
}
