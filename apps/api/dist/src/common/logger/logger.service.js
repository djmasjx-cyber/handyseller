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
exports.LoggerService = void 0;
const common_1 = require("@nestjs/common");
const winston = require("winston");
let LoggerService = class LoggerService {
    constructor() {
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL ?? 'info',
            format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston.format.errors({ stack: true }), winston.format.json()),
            defaultMeta: { service: 'handyseller-api' },
            transports: [
                new winston.transports.Console({
                    format: process.env.NODE_ENV === 'production'
                        ? winston.format.json()
                        : winston.format.combine(winston.format.colorize(), winston.format.printf(({ timestamp, level, message, requestId, userId, ip, userAgent, ...meta }) => {
                            const parts = [timestamp, level, message];
                            if (requestId)
                                parts.push(`[${requestId}]`);
                            if (userId)
                                parts.push(`user=${userId}`);
                            if (ip)
                                parts.push(`ip=${ip}`);
                            if (Object.keys(meta).length)
                                parts.push(JSON.stringify(meta));
                            return parts.join(' ');
                        })),
                }),
            ],
        });
    }
    info(message, context) {
        this.logger.info(message, context);
    }
    warn(message, context) {
        this.logger.warn(message, context);
    }
    error(message, context) {
        this.logger.error(message, context);
    }
    getWinston() {
        return this.logger;
    }
};
exports.LoggerService = LoggerService;
exports.LoggerService = LoggerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], LoggerService);
//# sourceMappingURL=logger.service.js.map