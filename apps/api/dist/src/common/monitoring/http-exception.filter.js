"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AllExceptionsFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const sentry_service_1 = require("./sentry.service");
const telegram_alert_service_1 = require("./telegram-alert.service");
const logger_service_1 = require("../logger/logger.service");
let AllExceptionsFilter = AllExceptionsFilter_1 = class AllExceptionsFilter {
    constructor(sentry, telegram, appLogger) {
        this.sentry = sentry;
        this.telegram = telegram;
        this.appLogger = appLogger;
        this.logger = new common_1.Logger(AllExceptionsFilter_1.name);
    }
    async catch(exception, host) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse();
        const req = ctx.getRequest();
        const requestId = req.requestId;
        const userId = req.user?.id;
        const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '-';
        const userAgent = req.headers['user-agent'] ?? '-';
        const status = exception instanceof common_1.HttpException
            ? exception.getStatus()
            : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        const message = exception instanceof common_1.HttpException
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
            this.sentry.captureException(exception instanceof Error ? exception : new Error(String(exception)), context);
            await this.telegram.sendAlert(message, { ...context, stack: exception instanceof Error ? exception.stack : undefined });
        }
        const clientMessage = status >= 500 && process.env.NODE_ENV !== 'production'
            ? message
            : status >= 500
                ? 'Internal server error'
                : message;
        res.status(status).json({
            statusCode: status,
            message: clientMessage,
            requestId,
        });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = AllExceptionsFilter_1 = __decorate([
    (0, common_1.Catch)(),
    __metadata("design:paramtypes", [sentry_service_1.SentryService,
        telegram_alert_service_1.TelegramAlertService,
        logger_service_1.LoggerService])
], AllExceptionsFilter);
//# sourceMappingURL=http-exception.filter.js.map