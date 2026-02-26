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
exports.OrdersHoldTransitionCron = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../common/database/prisma.service");
const orders_service_1 = require("./orders.service");
let OrdersHoldTransitionCron = class OrdersHoldTransitionCron {
    constructor(prisma, ordersService) {
        this.prisma = prisma;
        this.ordersService = ordersService;
    }
    async handleCron() {
        const connections = await this.prisma.marketplaceConnection.findMany({
            where: { token: { not: null } },
            select: { userId: true },
            distinct: ['userId'],
        });
        for (const { userId } of connections) {
            try {
                const result = await this.ordersService.processHoldExpiredOrders(userId);
                if (result.processed > 0 || result.errors.length > 0) {
                    console.log(`[OrdersHoldTransitionCron] user ${userId}: processed=${result.processed}, skipped=${result.skipped}`);
                    if (result.errors.length > 0) {
                        console.warn(`[OrdersHoldTransitionCron] errors:`, result.errors.slice(0, 5));
                    }
                }
            }
            catch (err) {
                console.error(`[OrdersHoldTransitionCron] Ошибка для user ${userId}:`, err);
            }
        }
    }
};
exports.OrdersHoldTransitionCron = OrdersHoldTransitionCron;
__decorate([
    (0, schedule_1.Cron)('*/5 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OrdersHoldTransitionCron.prototype, "handleCron", null);
exports.OrdersHoldTransitionCron = OrdersHoldTransitionCron = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        orders_service_1.OrdersService])
], OrdersHoldTransitionCron);
//# sourceMappingURL=orders-hold-transition.cron.js.map