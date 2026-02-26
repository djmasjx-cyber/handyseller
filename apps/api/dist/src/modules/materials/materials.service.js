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
exports.MaterialsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const subscriptions_service_1 = require("../subscriptions/subscriptions.service");
let MaterialsService = class MaterialsService {
    constructor(prisma, subscriptionsService) {
        this.prisma = prisma;
        this.subscriptionsService = subscriptionsService;
    }
    async findAll(userId) {
        const limits = await this.subscriptionsService.getLimits(userId);
        if (!limits.materialsAllowed) {
            return [];
        }
        return this.prisma.material.findMany({
            where: { userId },
            orderBy: { name: 'asc' },
        });
    }
    async create(userId, data) {
        const limits = await this.subscriptionsService.getLimits(userId);
        if (!limits.materialsAllowed) {
            throw new common_1.BadRequestException('Учёт материалов доступен на плане «Профессиональный». Перейдите в раздел «Подписка».');
        }
        return this.prisma.material.create({
            data: { ...data, userId, unit: data.unit ?? 'шт' },
        });
    }
};
exports.MaterialsService = MaterialsService;
exports.MaterialsService = MaterialsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        subscriptions_service_1.SubscriptionsService])
], MaterialsService);
//# sourceMappingURL=materials.service.js.map