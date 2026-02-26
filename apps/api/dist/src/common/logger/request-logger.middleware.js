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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestLoggerMiddleware = void 0;
const common_1 = require("@nestjs/common");
const morgan = require("morgan");
const uuid_1 = require("uuid");
const logger_service_1 = require("./logger.service");
let RequestLoggerMiddleware = class RequestLoggerMiddleware {
    constructor(logger) {
        this.logger = logger;
        this.morgan = morgan((tokens, req, res) => {
            const requestId = req.requestId ?? '-';
            const userId = req.user?.id ?? '-';
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
        }, { stream: { write: () => { } } });
    }
    use(req, res, next) {
        const requestId = req.headers['x-request-id'] ?? (0, uuid_1.v4)();
        req.requestId = requestId;
        res.setHeader('X-Request-Id', requestId);
        this.morgan(req, res, next);
    }
};
exports.RequestLoggerMiddleware = RequestLoggerMiddleware;
exports.RequestLoggerMiddleware = RequestLoggerMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [logger_service_1.LoggerService])
], RequestLoggerMiddleware);
//# sourceMappingURL=request-logger.middleware.js.map