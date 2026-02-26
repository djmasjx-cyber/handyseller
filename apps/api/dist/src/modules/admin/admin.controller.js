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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const users_service_1 = require("../users/users.service");
const payments_service_1 = require("../payments/payments.service");
const subscriptions_service_1 = require("../subscriptions/subscriptions.service");
const marketplaces_service_1 = require("../marketplaces/marketplaces.service");
const orders_service_1 = require("../orders/orders.service");
const client_1 = require("@prisma/client");
const refund_payment_dto_1 = require("../payments/dto/refund-payment.dto");
const update_subscription_dto_1 = require("./dto/update-subscription.dto");
let AdminController = class AdminController {
    constructor(usersService, paymentsService, subscriptionsService, marketplacesService, ordersService) {
        this.usersService = usersService;
        this.paymentsService = paymentsService;
        this.subscriptionsService = subscriptionsService;
        this.marketplacesService = marketplacesService;
        this.ordersService = ordersService;
    }
    async updateUserSubscription(userId, dto) {
        const expiresAt = dto.expiresAt
            ? new Date(dto.expiresAt)
            : dto.expiresAt === null
                ? null
                : undefined;
        return this.subscriptionsService.updatePlan(userId, dto.plan, expiresAt);
    }
    async getUsers(skip, take) {
        const skipNum = skip ? parseInt(skip, 10) : 0;
        const takeNum = take ? Math.min(parseInt(take, 10), 100) : 50;
        return this.usersService.findAllForAdmin({
            skip: isNaN(skipNum) ? 0 : skipNum,
            take: isNaN(takeNum) ? 50 : takeNum,
        });
    }
    async getPaymentsStats() {
        return this.paymentsService.getStatsForAdmin();
    }
    async getPaymentsWebhooks(skip, take) {
        const skipNum = skip ? parseInt(skip, 10) : 0;
        const takeNum = take ? Math.min(parseInt(take, 10), 100) : 50;
        return this.paymentsService.findAllWebhooksForAdmin({
            skip: isNaN(skipNum) ? 0 : skipNum,
            take: isNaN(takeNum) ? 50 : takeNum,
        });
    }
    async getPaymentById(id) {
        const payment = await this.paymentsService.findByIdForAdmin(id);
        if (!payment)
            return { payment: null };
        return { payment };
    }
    async debugWbOrder(email, orderId, doSync) {
        if (!email?.trim() || !orderId?.trim()) {
            throw new common_1.BadRequestException('Укажите email и orderId, например ?email=nmanoilo@ya.ru&orderId=4645532575');
        }
        const user = await this.usersService.findByEmail(email.trim());
        if (!user) {
            return { error: 'Пользователь не найден', email: email.trim() };
        }
        const userId = user.id;
        const wbResult = await this.marketplacesService.getWbOrderStatus(userId, orderId.trim());
        if (doSync === '1' || doSync === 'true') {
            const syncResult = await this.ordersService.syncFromMarketplaces(userId);
            return { ...wbResult, syncResult };
        }
        return wbResult;
    }
    async getPayments(skip, take) {
        const skipNum = skip ? parseInt(skip, 10) : 0;
        const takeNum = take ? Math.min(parseInt(take, 10), 100) : 50;
        return this.paymentsService.findAllForAdmin({
            skip: isNaN(skipNum) ? 0 : skipNum,
            take: isNaN(takeNum) ? 50 : takeNum,
        });
    }
    async retryStockReserve(externalId, orderId) {
        const id = (orderId ?? externalId)?.trim();
        if (!id)
            throw new common_1.BadRequestException('Укажите externalId или orderId (например 4686579129)');
        return this.ordersService.retryStockReserveByExternalId(id);
    }
    async refundPayment(paymentId, dto) {
        return this.paymentsService.refund(paymentId, dto.amount);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Patch)('users/:userId/subscription'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_subscription_dto_1.UpdateSubscriptionDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateUserSubscription", null);
__decorate([
    (0, common_1.Get)('users'),
    __param(0, (0, common_1.Query)('skip')),
    __param(1, (0, common_1.Query)('take')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getUsers", null);
__decorate([
    (0, common_1.Get)('payments/stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getPaymentsStats", null);
__decorate([
    (0, common_1.Get)('payments/webhooks'),
    __param(0, (0, common_1.Query)('skip')),
    __param(1, (0, common_1.Query)('take')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getPaymentsWebhooks", null);
__decorate([
    (0, common_1.Get)('payments/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getPaymentById", null);
__decorate([
    (0, common_1.Get)('debug-wb-order'),
    __param(0, (0, common_1.Query)('email')),
    __param(1, (0, common_1.Query)('orderId')),
    __param(2, (0, common_1.Query)('sync')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "debugWbOrder", null);
__decorate([
    (0, common_1.Get)('payments'),
    __param(0, (0, common_1.Query)('skip')),
    __param(1, (0, common_1.Query)('take')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getPayments", null);
__decorate([
    (0, common_1.Post)('orders/retry-stock-reserve'),
    __param(0, (0, common_1.Body)('externalId')),
    __param(1, (0, common_1.Body)('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "retryStockReserve", null);
__decorate([
    (0, common_1.Post)('payments/:id/refund'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, refund_payment_dto_1.RefundPaymentDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "refundPayment", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        payments_service_1.PaymentsService,
        subscriptions_service_1.SubscriptionsService,
        marketplaces_service_1.MarketplacesService,
        orders_service_1.OrdersService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map