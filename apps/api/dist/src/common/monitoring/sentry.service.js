"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SentryService = void 0;
const common_1 = require("@nestjs/common");
const Sentry = require("@sentry/node");
let SentryService = class SentryService {
    onModuleDestroy() {
        Sentry.close(2000);
    }
    captureException(error, context) {
        if (process.env.SENTRY_DSN) {
            Sentry.withScope((scope) => {
                if (context?.requestId)
                    scope.setTag('requestId', String(context.requestId));
                if (context?.userId)
                    scope.setUser({ id: String(context.userId) });
                if (context)
                    scope.setContext('extra', context);
                Sentry.captureException(error);
            });
        }
    }
    captureMessage(message, level = 'error', context) {
        if (process.env.SENTRY_DSN) {
            Sentry.withScope((scope) => {
                if (context?.requestId)
                    scope.setTag('requestId', String(context.requestId));
                if (context?.userId)
                    scope.setUser({ id: String(context.userId) });
                if (context)
                    scope.setContext('extra', context);
                Sentry.captureMessage(message, level);
            });
        }
    }
};
exports.SentryService = SentryService;
exports.SentryService = SentryService = __decorate([
    (0, common_1.Injectable)()
], SentryService);
//# sourceMappingURL=sentry.service.js.map