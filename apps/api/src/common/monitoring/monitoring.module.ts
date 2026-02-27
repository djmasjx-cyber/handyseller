import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryService } from './sentry.service';
import { TelegramAlertService } from './telegram-alert.service';
import { AllExceptionsFilter } from './http-exception.filter';
import { LoggerModule } from '../logger/logger.module';
import { LoggerService } from '../logger/logger.service';

// Prometheus отключён — вызывает MODULE_NOT_FOUND в Docker
@Module({
  imports: [LoggerModule],
  providers: [
    SentryService,
    TelegramAlertService,
    {
      provide: APP_FILTER,
      useFactory: (sentry: SentryService, telegram: TelegramAlertService, logger: LoggerService) =>
        new AllExceptionsFilter(sentry, telegram, logger),
      inject: [SentryService, TelegramAlertService, LoggerService],
    },
  ],
  exports: [SentryService, TelegramAlertService],
})
export class MonitoringModule {}
