"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const nestjs_prometheus_1 = require("@willsoto/nestjs-prometheus");
const sentry_service_1 = require("./sentry.service");
const telegram_alert_service_1 = require("./telegram-alert.service");
const http_exception_filter_1 = require("./http-exception.filter");
const logger_module_1 = require("../logger/logger.module");
const logger_service_1 = require("../logger/logger.service");
let MonitoringModule = class MonitoringModule {
};
exports.MonitoringModule = MonitoringModule;
exports.MonitoringModule = MonitoringModule = __decorate([
    (0, common_1.Module)({
        imports: [
            nestjs_prometheus_1.PrometheusModule.register({
                path: '/metrics',
                defaultMetrics: {
                    enabled: true,
                },
            }),
            logger_module_1.LoggerModule,
        ],
        providers: [
            sentry_service_1.SentryService,
            telegram_alert_service_1.TelegramAlertService,
            {
                provide: core_1.APP_FILTER,
                useFactory: (sentry, telegram, logger) => new http_exception_filter_1.AllExceptionsFilter(sentry, telegram, logger),
                inject: [sentry_service_1.SentryService, telegram_alert_service_1.TelegramAlertService, logger_service_1.LoggerService],
            },
        ],
        exports: [sentry_service_1.SentryService, telegram_alert_service_1.TelegramAlertService],
    })
], MonitoringModule);
//# sourceMappingURL=monitoring.module.js.map