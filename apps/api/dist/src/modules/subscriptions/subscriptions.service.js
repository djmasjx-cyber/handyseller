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
exports.SubscriptionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const PLAN_LIMITS = {
    FREE: { maxProducts: 5, maxMarketplaces: 1, materialsAllowed: false },
    PROFESSIONAL: { maxProducts: 20, maxMarketplaces: 2, materialsAllowed: false },
    BUSINESS: { maxProducts: 999_999, maxMarketplaces: 99, materialsAllowed: true },
};
let SubscriptionsService = class SubscriptionsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findForUser(userId) {
        let sub = await this.prisma.subscription.findUnique({
            where: { userId },
        });
        if (!sub) {
            sub = await this.prisma.subscription.create({
                data: { userId, plan: 'FREE' },
            });
        }
        return sub;
    }
    async updatePlan(userId, plan, expiresAt) {
        const sub = await this.findForUser(userId);
        const data = { plan };
        if (expiresAt !== undefined)
            data.expiresAt = expiresAt;
        else if (plan !== 'FREE') {
            const d = new Date();
            d.setMonth(d.getMonth() + 1);
            data.expiresAt = d;
        }
        else {
            data.expiresAt = null;
        }
        return this.prisma.subscription.update({
            where: { id: sub.id },
            data,
        });
    }
    async getLimits(userId) {
        const sub = await this.findForUser(userId);
        const isExpired = sub.expiresAt ? new Date(sub.expiresAt) < new Date() : false;
        const plan = isExpired ? 'FREE' : sub.plan;
        return PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
    }
};
exports.SubscriptionsService = SubscriptionsService;
exports.SubscriptionsService = SubscriptionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SubscriptionsService);
//# sourceMappingURL=subscriptions.service.js.map