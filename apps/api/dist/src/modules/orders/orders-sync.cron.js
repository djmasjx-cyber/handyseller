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
exports.OrdersSyncCron = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../common/database/prisma.service");
const orders_service_1 = require("./orders.service");
let OrdersSyncCron = class OrdersSyncCron {
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
                await this.ordersService.syncFromMarketplaces(userId);
            }
            catch (err) {
                console.error(`[OrdersSyncCron] Ошибка синхронизации для user ${userId}:`, err);
            }
        }
    }
};
exports.OrdersSyncCron = OrdersSyncCron;
__decorate([
    (0, schedule_1.Cron)('*/5 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OrdersSyncCron.prototype, "handleCron", null);
exports.OrdersSyncCron = OrdersSyncCron = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        orders_service_1.OrdersService])
], OrdersSyncCron);
//# sourceMappingURL=orders-sync.cron.js.map