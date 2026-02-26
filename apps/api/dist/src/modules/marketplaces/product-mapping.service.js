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
exports.ProductMappingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
let ProductMappingService = class ProductMappingService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findProductByExternalId(userId, marketplace, externalSystemId) {
        const mapping = await this.prisma.productMarketplaceMapping.findFirst({
            where: { userId, marketplace, externalSystemId: String(externalSystemId), isActive: true },
            include: { product: true },
        });
        return mapping?.product ?? null;
    }
    async getMappingsForProduct(productId, userId) {
        return this.prisma.productMarketplaceMapping.findMany({
            where: { productId, userId, isActive: true, syncStock: true },
        });
    }
    async getExternalId(productId, userId, marketplace) {
        const m = await this.prisma.productMarketplaceMapping.findFirst({
            where: { productId, userId, marketplace, isActive: true },
        });
        return m?.externalSystemId ?? null;
    }
    async getOzonMapping(productId, userId) {
        const m = await this.prisma.productMarketplaceMapping.findFirst({
            where: { productId, userId, marketplace: 'OZON', isActive: true },
        });
        return m ? { externalSystemId: m.externalSystemId, externalArticle: m.externalArticle } : null;
    }
    async getOzonMappingForUserIds(productId, userIds, preferredArticle) {
        const all = await this.prisma.productMarketplaceMapping.findMany({
            where: { productId, userId: { in: userIds }, marketplace: 'OZON', isActive: true },
        });
        if (all.length === 0)
            return null;
        if (all.length === 1)
            return { externalSystemId: all[0].externalSystemId, externalArticle: all[0].externalArticle };
        const art = (preferredArticle ?? '').toString().trim();
        if (art) {
            const match = all.find((m) => (m.externalArticle ?? '').trim() === art);
            if (match)
                return { externalSystemId: match.externalSystemId, externalArticle: match.externalArticle };
        }
        return { externalSystemId: all[0].externalSystemId, externalArticle: all[0].externalArticle };
    }
    async getExternalIdForUserIds(productId, userIds, marketplace) {
        const m = await this.prisma.productMarketplaceMapping.findFirst({
            where: { productId, userId: { in: userIds }, marketplace, isActive: true },
        });
        return m?.externalSystemId ?? null;
    }
    async getWbNmId(productId, userId) {
        const m = await this.prisma.productMarketplaceMapping.findFirst({
            where: { productId, userId, marketplace: 'WILDBERRIES' },
        });
        if (!m)
            return null;
        const n = parseInt(m.externalSystemId, 10);
        return isNaN(n) ? null : n;
    }
    async updateExternalId(productId, userId, marketplace, newExternalSystemId, options) {
        const existing = await this.prisma.productMarketplaceMapping.findFirst({
            where: { productId, userId, marketplace, isActive: true },
        });
        if (!existing)
            return;
        await this.doUpdateExternalId(existing, newExternalSystemId, options);
    }
    async updateOzonMappingForUserIds(productId, userIds, newExternalSystemId, newExternalArticle) {
        const existing = await this.prisma.productMarketplaceMapping.findFirst({
            where: { productId, userId: { in: userIds }, marketplace: 'OZON', isActive: true },
        });
        if (!existing)
            return false;
        await this.doUpdateExternalId(existing, newExternalSystemId, { externalArticle: newExternalArticle });
        return true;
    }
    async doUpdateExternalId(existing, newExternalSystemId, options) {
        const newExtId = String(newExternalSystemId);
        const newArt = options?.externalArticle ?? existing.externalArticle;
        if (existing.externalSystemId === newExtId && (existing.externalArticle ?? '') === (newArt ?? ''))
            return;
        await this.prisma.$transaction([
            this.prisma.productMarketplaceMapping.delete({ where: { id: existing.id } }),
            this.prisma.productMarketplaceMapping.create({
                data: {
                    id: crypto.randomUUID(),
                    productId: existing.productId,
                    userId: existing.userId,
                    marketplace: existing.marketplace,
                    externalSystemId: String(newExternalSystemId),
                    externalArticle: options?.externalArticle ?? existing.externalArticle,
                    externalGroupId: existing.externalGroupId,
                    syncStock: existing.syncStock,
                    isActive: existing.isActive,
                },
            }),
        ]);
    }
    async deleteMapping(productId, userIds, marketplace, externalSystemId) {
        const deleted = await this.prisma.productMarketplaceMapping.deleteMany({
            where: {
                productId,
                userId: { in: userIds },
                marketplace,
                externalSystemId: String(externalSystemId),
            },
        });
        return (deleted.count ?? 0) > 0;
    }
    async upsertMapping(productId, userId, marketplace, externalSystemId, options) {
        return this.prisma.productMarketplaceMapping.upsert({
            where: {
                userId_marketplace_externalSystemId: {
                    userId,
                    marketplace,
                    externalSystemId: String(externalSystemId),
                },
            },
            create: {
                id: crypto.randomUUID(),
                productId,
                userId,
                marketplace,
                externalSystemId: String(externalSystemId),
                externalArticle: options?.externalArticle,
                externalGroupId: options?.externalGroupId,
            },
            update: {
                productId,
                externalArticle: options?.externalArticle ?? undefined,
                externalGroupId: options?.externalGroupId ?? undefined,
            },
        });
    }
};
exports.ProductMappingService = ProductMappingService;
exports.ProductMappingService = ProductMappingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductMappingService);
//# sourceMappingURL=product-mapping.service.js.map