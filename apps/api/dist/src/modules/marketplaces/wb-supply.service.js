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
exports.WbSupplyService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
let WbSupplyService = class WbSupplyService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getActiveSupply(userId) {
        return this.prisma.wbSupply.findFirst({
            where: { userId, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
        });
    }
    async getOrCreateActiveSupply(userId, adapter) {
        const existing = await this.prisma.wbSupply.findFirst({
            where: { userId, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
        });
        if (existing)
            return existing;
        let supplyId;
        try {
            supplyId = await adapter.ensureFbsSupply();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new common_1.InternalServerErrorException(`WB: не удалось создать или получить активную поставку для FBS-заказов. ${msg}`);
        }
        if (!supplyId) {
            throw new common_1.InternalServerErrorException('WB: не удалось создать или получить активную поставку для FBS-заказов.');
        }
        const supply = await this.prisma.wbSupply.upsert({
            where: {
                userId_wbSupplyId: {
                    userId,
                    wbSupplyId: supplyId,
                },
            },
            create: {
                userId,
                wbSupplyId: supplyId,
                status: 'ACTIVE',
            },
            update: {
                status: 'ACTIVE',
            },
        });
        return supply;
    }
};
exports.WbSupplyService = WbSupplyService;
exports.WbSupplyService = WbSupplyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], WbSupplyService);
//# sourceMappingURL=wb-supply.service.js.map