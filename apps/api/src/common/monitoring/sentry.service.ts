import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as Sentry from '@sentry/node';

@Injectable()
export class SentryService implements OnModuleDestroy {
  onModuleDestroy() {
    Sentry.close(2000);
  }

  captureException(error: Error, context?: Record<string, unknown>) {
    if (process.env.SENTRY_DSN) {
      Sentry.withScope((scope) => {
        if (context?.requestId) scope.setTag('requestId', String(context.requestId));
        if (context?.userId) scope.setUser({ id: String(context.userId) });
        if (context) scope.setContext('extra', context);
        Sentry.captureException(error);
      });
    }
  }

  captureMessage(message: string, level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'error', context?: Record<string, unknown>) {
    if (process.env.SENTRY_DSN) {
      Sentry.withScope((scope) => {
        if (context?.requestId) scope.setTag('requestId', String(context.requestId));
        if (context?.userId) scope.setUser({ id: String(context.userId) });
        if (context) scope.setContext('extra', context);
        Sentry.captureMessage(message, level);
      });
    }
  }
}
