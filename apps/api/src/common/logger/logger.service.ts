import { Injectable } from '@nestjs/common';
import * as winston from 'winston';

export interface LogContext {
  requestId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  [key: string]: unknown;
}

@Injectable()
export class LoggerService {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL ?? 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: { service: 'handyseller-api' },
      transports: [
        new winston.transports.Console({
          format: process.env.NODE_ENV === 'production'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, requestId, userId, ip, userAgent, ...meta }) => {
                  const parts = [timestamp, level, message];
                  if (requestId) parts.push(`[${requestId}]`);
                  if (userId) parts.push(`user=${userId}`);
                  if (ip) parts.push(`ip=${ip}`);
                  if (Object.keys(meta).length) parts.push(JSON.stringify(meta));
                  return parts.join(' ');
                }),
              ),
        }),
      ],
    });
  }

  info(message: string, context?: LogContext) {
    this.logger.info(message, context);
  }

  warn(message: string, context?: LogContext) {
    this.logger.warn(message, context);
  }

  error(message: string, context?: LogContext) {
    this.logger.error(message, context);
  }

  getWinston() {
    return this.logger;
  }
}
