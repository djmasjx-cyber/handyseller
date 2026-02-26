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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const orders_service_1 = require("./orders.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
let OrdersController = class OrdersController {
    constructor(ordersService) {
        this.ordersService = ordersService;
    }
    async findAll(userId) {
        return this.ordersService.findAll(userId);
    }
    async sync(userId, since) {
        const sinceDate = since ? new Date(since) : undefined;
        return this.ordersService.syncFromMarketplaces(userId, sinceDate);
    }
    async getWbRaw(userId) {
        return this.ordersService.getRawOrdersFromWb(userId);
    }
    async getWbStatus(userId, orderId) {
        if (!orderId?.trim()) {
            throw new common_1.BadRequestException('Укажите orderId, например ?orderId=4645532575');
        }
        return this.ordersService.getWbOrderStatusDebug(userId, orderId.trim());
    }
    async getWbSticker(userId, orderId) {
        return this.ordersService.getWbStickerImage(userId, orderId);
    }
    async retryWbPush(userId, orderId) {
        return this.ordersService.retryPushOrderStatus(userId, orderId);
    }
    async retryStockReserve(userId, orderId, externalId) {
        const id = orderId ?? externalId;
        if (!id?.trim())
            throw new common_1.BadRequestException('Укажите orderId или externalId (например 4686579129)');
        return this.ordersService.retryStockReserve(userId, id.trim());
    }
    async updateStatus(userId, orderId, status) {
        const s = status?.toUpperCase();
        if (!s || !Object.values(client_1.OrderStatus).includes(s)) {
            throw new common_1.BadRequestException('Неверный статус');
        }
        return this.ordersService.updateStatus(userId, orderId, s);
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)('sync'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Query)('since')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "sync", null);
__decorate([
    (0, common_1.Get)('wb-raw'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getWbRaw", null);
__decorate([
    (0, common_1.Get)('wb-status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Query)('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getWbStatus", null);
__decorate([
    (0, common_1.Get)(':id/wb-sticker'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getWbSticker", null);
__decorate([
    (0, common_1.Post)(':id/retry-wb-push'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "retryWbPush", null);
__decorate([
    (0, common_1.Post)('retry-stock-reserve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Body)('orderId')),
    __param(2, (0, common_1.Body)('externalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "retryStockReserve", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "updateStatus", null);
exports.OrdersController = OrdersController = __decorate([
    (0, common_1.Controller)('orders'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [orders_service_1.OrdersService])
], OrdersController);
//# sourceMappingURL=orders.controller.js.map