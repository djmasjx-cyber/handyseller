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
exports.OrdersStatsTokenSyncListener = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const orders_service_1 = require("./orders.service");
let OrdersStatsTokenSyncListener = class OrdersStatsTokenSyncListener {
    constructor(ordersService) {
        this.ordersService = ordersService;
    }
    async handleStatsTokenUpdated(payload) {
        const { userId } = payload;
        try {
            const result = await this.ordersService.syncFromMarketplaces(userId);
            console.log(`[OrdersStatsTokenSyncListener] Синк заказов после обновления statsToken (user ${userId}):`, result);
        }
        catch (err) {
            console.error(`[OrdersStatsTokenSyncListener] Ошибка синка для user ${userId}:`, err);
        }
    }
};
exports.OrdersStatsTokenSyncListener = OrdersStatsTokenSyncListener;
__decorate([
    (0, event_emitter_1.OnEvent)('marketplace.wbStatsTokenUpdated'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrdersStatsTokenSyncListener.prototype, "handleStatsTokenUpdated", null);
exports.OrdersStatsTokenSyncListener = OrdersStatsTokenSyncListener = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [orders_service_1.OrdersService])
], OrdersStatsTokenSyncListener);
//# sourceMappingURL=orders-stats-token-sync.listener.js.map