import { Injectable } from '@nestjs/common';
import * as winston from 'winston';

export interface LogContext {
  requestId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEYWORDS = [
  'token',
  'secret',
  'password',
  'authorization',
  'api_key',
  'apikey',
  'cookie',
  'db_password',
];

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return '[REDACTED]';
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  return '[REDACTED]';
}

function sanitizeContext(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeContext(item));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (SENSITIVE_KEYWORDS.some((keyword) => normalizedKey.includes(keyword))) {
        out[key] = redactValue(v);
      } else {
        out[key] = sanitizeContext(v);
      }
    }
    return out;
  }
  return value;
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
    this.logger.info(message, sanitizeContext(context));
  }

  warn(message: string, context?: LogContext) {
    this.logger.warn(message, sanitizeContext(context));
  }

  error(message: string, context?: LogContext) {
    this.logger.error(message, sanitizeContext(context));
  }

  getWinston() {
    return this.logger;
  }
}
