"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersModule = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const orders_service_1 = require("./orders.service");
const orders_controller_1 = require("./orders.controller");
const orders_sync_cron_1 = require("./orders-sync.cron");
const orders_hold_transition_cron_1 = require("./orders-hold-transition.cron");
const orders_stats_token_sync_listener_1 = require("./orders-stats-token-sync.listener");
const marketplaces_module_1 = require("../marketplaces/marketplaces.module");
const products_module_1 = require("../products/products.module");
let OrdersModule = class OrdersModule {
};
exports.OrdersModule = OrdersModule;
exports.OrdersModule = OrdersModule = __decorate([
    (0, common_1.Module)({
        imports: [event_emitter_1.EventEmitterModule, marketplaces_module_1.MarketplacesModule, products_module_1.ProductsModule],
        controllers: [orders_controller_1.OrdersController],
        providers: [orders_service_1.OrdersService, orders_sync_cron_1.OrdersSyncCron, orders_hold_transition_cron_1.OrdersHoldTransitionCron, orders_stats_token_sync_listener_1.OrdersStatsTokenSyncListener],
        exports: [orders_service_1.OrdersService],
    })
], OrdersModule);
//# sourceMappingURL=orders.module.js.map