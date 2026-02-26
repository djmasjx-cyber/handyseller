"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const schedule_1 = require("@nestjs/schedule");
const event_emitter_1 = require("@nestjs/event-emitter");
const throttler_1 = require("@nestjs/throttler");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const crypto_module_1 = require("./common/crypto/crypto.module");
const database_module_1 = require("./common/database/database.module");
const logger_module_1 = require("./common/logger/logger.module");
const monitoring_module_1 = require("./common/monitoring/monitoring.module");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const products_module_1 = require("./modules/products/products.module");
const materials_module_1 = require("./modules/materials/materials.module");
const marketplaces_module_1 = require("./modules/marketplaces/marketplaces.module");
const orders_module_1 = require("./modules/orders/orders.module");
const subscriptions_module_1 = require("./modules/subscriptions/subscriptions.module");
const analytics_module_1 = require("./modules/analytics/analytics.module");
const dashboard_module_1 = require("./modules/dashboard/dashboard.module");
const admin_module_1 = require("./modules/admin/admin.module");
const payments_module_1 = require("./modules/payments/payments.module");
function getTracker(req) {
    const headers = req.headers ?? {};
    const authHeader = headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
        try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
            if (payload.sub)
                return `user:${payload.sub}`;
        }
        catch {
        }
    }
    const forwarded = headers['x-forwarded-for'];
    const ip = forwarded?.split(',')[0]?.trim() ?? req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    return `ip:${ip}`;
}
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            schedule_1.ScheduleModule.forRoot(),
            event_emitter_1.EventEmitterModule.forRoot(),
            throttler_1.ThrottlerModule.forRoot({
                throttlers: [
                    {
                        ttl: 60000,
                        limit: (context) => {
                            const req = context.switchToHttp().getRequest();
                            const tracker = getTracker(req);
                            return tracker.startsWith('user:') ? 100 : 1000;
                        },
                        getTracker: (req) => getTracker(req),
                    },
                ],
            }),
            crypto_module_1.CryptoModule,
            database_module_1.DatabaseModule,
            logger_module_1.LoggerModule,
            monitoring_module_1.MonitoringModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            products_module_1.ProductsModule,
            materials_module_1.MaterialsModule,
            marketplaces_module_1.MarketplacesModule,
            orders_module_1.OrdersModule,
            subscriptions_module_1.SubscriptionsModule,
            analytics_module_1.AnalyticsModule,
            dashboard_module_1.DashboardModule,
            admin_module_1.AdminModule,
            payments_module_1.PaymentsModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            { provide: core_1.APP_GUARD, useClass: throttler_1.ThrottlerGuard },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map