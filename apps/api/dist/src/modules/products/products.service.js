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
exports.ProductsService = exports.PRODUCT_SYNC_CHANGED_EVENT = exports.STOCK_CHANGED_EVENT = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const prisma_service_1 = require("../../common/database/prisma.service");
const crypto_service_1 = require("../../common/crypto/crypto.service");
const stock_service_1 = require("./stock.service");
const subscriptions_service_1 = require("../subscriptions/subscriptions.service");
exports.STOCK_CHANGED_EVENT = 'stock.changed';
exports.PRODUCT_SYNC_CHANGED_EVENT = 'product.sync.changed';
let ProductsService = class ProductsService {
    constructor(prisma, stockService, crypto, subscriptionsService, eventEmitter) {
        this.prisma = prisma;
        this.stockService = stockService;
        this.crypto = crypto;
        this.subscriptionsService = subscriptionsService;
        this.eventEmitter = eventEmitter;
    }
    async findAll(userId, includeArchived = false) {
        return this.prisma.product.findMany({
            where: {
                userId,
                ...(includeArchived ? {} : { archivedAt: null }),
            },
            orderBy: { createdAt: 'desc' },
            include: {
                marketplaceMappings: {
                    where: { isActive: true },
                    select: { marketplace: true, externalSystemId: true },
                },
            },
        });
    }
    async findArchived(userId) {
        return this.prisma.product.findMany({
            where: { userId, archivedAt: { not: null } },
            orderBy: { archivedAt: 'desc' },
            include: {
                marketplaceMappings: {
                    where: { isActive: true },
                    select: { marketplace: true, externalSystemId: true },
                },
            },
        });
    }
    async create(userId, data) {
        const [limits, count] = await Promise.all([
            this.subscriptionsService.getLimits(userId),
            this.prisma.product.count({ where: { userId } }),
        ]);
        if (count >= limits.maxProducts) {
            throw new common_1.BadRequestException(`Достигнут лимит товаров (${limits.maxProducts}) по вашему тарифу. Перейдите на другой план в разделе «Подписка».`);
        }
        return this.prisma.product.create({
            data: { ...data, userId, price: data.price },
        });
    }
    async findBySku(userId, sku) {
        return this.prisma.product.findFirst({
            where: { userId, sku },
        });
    }
    async findBySkuSuffix(userId, suffix) {
        return this.prisma.product.findFirst({
            where: {
                userId,
                sku: { endsWith: suffix },
            },
        });
    }
    async findById(userId, id) {
        return this.prisma.product.findFirst({
            where: { userId, id },
        });
    }
    async findByIdWithMappings(userId, id) {
        return this.prisma.product.findFirst({
            where: { userId, id },
            include: {
                marketplaceMappings: {
                    select: { marketplace: true, externalSystemId: true, externalArticle: true },
                },
            },
        });
    }
    async findByIdWithMappingsByArticleOrId(userId, value) {
        const product = await this.findByArticleOrId(userId, value);
        if (!product)
            return null;
        return this.findByIdWithMappings(userId, product.id);
    }
    async findByArticle(userId, article) {
        return this.prisma.product.findFirst({
            where: { userId, article },
        });
    }
    async findByArticleOrId(userId, value) {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        const numId = parseInt(trimmed.replace(/^0+/, '') || '0', 10);
        if (!isNaN(numId) && numId > 0 && trimmed.replace(/^0+/, '') === String(numId)) {
            const byDisplay = await this.prisma.product.findFirst({
                where: { userId, displayId: numId },
            });
            if (byDisplay)
                return byDisplay;
        }
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
        if (isUuid) {
            return this.findById(userId, trimmed);
        }
        return this.findByArticle(userId, trimmed);
    }
    async replenish(userId, productIdOrArticle, delta, note) {
        const product = await this.findByArticleOrId(userId, productIdOrArticle);
        if (!product) {
            throw new common_1.BadRequestException('Товар не найден. Проверьте ID или артикул.');
        }
        return this.stockService.change(product.id, userId, delta, {
            source: 'MANUAL',
            note,
            allowNegative: false,
        });
    }
    async setStock(userId, productId, stock) {
        const product = await this.findByArticleOrId(userId, productId);
        if (!product) {
            throw new common_1.BadRequestException('Товар не найден.');
        }
        if (stock < 0) {
            throw new common_1.BadRequestException('Остаток не может быть отрицательным.');
        }
        const currentStock = product.stock ?? 0;
        const delta = stock - currentStock;
        if (delta === 0)
            return product;
        return this.stockService.change(product.id, userId, delta, {
            source: 'MANUAL',
            note: `Изменение через таблицу: ${currentStock} → ${stock}`,
            allowNegative: false,
        });
    }
    async archive(userId, productId) {
        const product = await this.findByArticleOrId(userId, productId);
        if (!product) {
            throw new common_1.BadRequestException('Товар не найден.');
        }
        if (product.archivedAt) {
            throw new common_1.BadRequestException('Товар уже в архиве.');
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SELECT set_config('app.changed_by', $1, true)`, userId);
            await tx.product.update({
                where: { id: product.id },
                data: { archivedAt: new Date() },
            });
        });
        return { archived: true };
    }
    async restore(userId, productId) {
        const product = await this.findByArticleOrId(userId, productId);
        if (!product) {
            throw new common_1.BadRequestException('Товар не найден.');
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SELECT set_config('app.changed_by', $1, true)`, userId);
            await tx.product.update({
                where: { id: product.id },
                data: { archivedAt: null },
            });
        });
        return { restored: true };
    }
    async remove(userId, productId) {
        return this.archive(userId, productId);
    }
    async getStockHistory(userId, productId) {
        const product = await this.findByArticleOrId(userId, productId);
        if (!product)
            return [];
        const entries = await this.prisma.stockLog.findMany({
            where: { productId: product.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { user: { select: { name: true, email: true, emailEncrypted: true } } },
        });
        return entries.map((e) => ({
            ...e,
            user: e.user
                ? {
                    name: this.crypto.decryptOptional(e.user.name) ?? e.user.name,
                    email: e.user.emailEncrypted
                        ? this.crypto.decryptOptional(e.user.emailEncrypted)
                        : e.user.email,
                }
                : null,
        }));
    }
    async update(userId, productIdOrArticle, data) {
        const product = await this.findByArticleOrId(userId, productIdOrArticle);
        if (!product) {
            throw new common_1.BadRequestException('Товар не найден.');
        }
        const productId = product.id;
        const updates = {};
        const toStr = (v) => v === null || v === undefined ? null : String(v);
        const readOnlyFields = new Set(['barcodeWb', 'barcodeOzon']);
        for (const [field, value] of Object.entries(data)) {
            if (value === undefined || readOnlyFields.has(field))
                continue;
            const current = product[field];
            let newVal = value;
            if (field === 'price') {
                const num = Number(value);
                if (isNaN(num) || num < 0)
                    continue;
                newVal = num;
            }
            if (['weight', 'width', 'length', 'height', 'itemsPerPack', 'ozonCategoryId', 'ozonTypeId'].includes(field)) {
                const num = Number(value);
                if (isNaN(num))
                    continue;
                if (num < 0 && field !== 'ozonCategoryId' && field !== 'ozonTypeId')
                    continue;
                newVal = num;
            }
            const oldStr = toStr(current);
            let normalizedNew = newVal;
            if ((field === 'article' ||
                field === 'description' ||
                field === 'seoTitle' ||
                field === 'seoKeywords' ||
                field === 'seoDescription' ||
                field === 'imageUrl' ||
                field === 'brand' ||
                field === 'productUrl' ||
                field === 'color' ||
                field === 'material' ||
                field === 'craftType' ||
                field === 'countryOfOrigin' ||
                field === 'packageContents' ||
                field === 'richContent' ||
                field === 'ozonCategoryPath') &&
                typeof newVal === 'string' &&
                newVal === '') {
                normalizedNew = null;
            }
            const newStr = toStr(normalizedNew);
            if (oldStr !== newStr) {
                updates[field] = normalizedNew;
            }
        }
        if (Object.keys(updates).length === 0)
            return product;
        const syncRelevantFields = new Set([
            'title', 'description', 'price', 'imageUrl', 'brand', 'weight', 'width', 'length', 'height',
            'color', 'material', 'craftType', 'countryOfOrigin', 'packageContents', 'richContent',
            'itemsPerPack', 'ozonCategoryId', 'ozonTypeId', 'seoTitle', 'seoKeywords', 'seoDescription',
        ]);
        const shouldSyncToMarketplaces = Object.keys(updates).some((k) => syncRelevantFields.has(k));
        const updated = await this.prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SELECT set_config('app.changed_by', $1, true)`, userId);
            return tx.product.update({
                where: { id: productId },
                data: { ...updates },
            });
        });
        if (shouldSyncToMarketplaces) {
            this.eventEmitter.emit(exports.PRODUCT_SYNC_CHANGED_EVENT, { userId, productId });
        }
        return updated;
    }
    async getProductHistory(userId, productId) {
        const product = await this.findByArticleOrId(userId, productId);
        if (!product)
            return [];
        const id = product.id;
        const mapUser = (u) => u
            ? {
                name: this.crypto.decryptOptional(u.name) ?? u.name,
                email: u.emailEncrypted ? this.crypto.decryptOptional(u.emailEncrypted) : u.email,
            }
            : null;
        const [changeEntries, stockEntries, fieldEntries] = await Promise.all([
            this.prisma.productChangeLog.findMany({
                where: { productId: id },
                orderBy: { createdAt: 'desc' },
                take: 50,
                include: { user: { select: { name: true, email: true, emailEncrypted: true } } },
            }),
            this.prisma.stockLog.findMany({
                where: { productId: id },
                orderBy: { createdAt: 'desc' },
                take: 30,
                include: { user: { select: { name: true, email: true, emailEncrypted: true } } },
            }),
            this.prisma.productFieldLog
                .findMany({
                where: { productId: id },
                orderBy: { createdAt: 'desc' },
                take: 30,
                include: { user: { select: { name: true, email: true, emailEncrypted: true } } },
            })
                .catch(() => []),
        ]);
        const fromChange = changeEntries.map((e) => {
            const type = e.changeType === 'STOCK'
                ? 'stock'
                : e.changeType === 'ARCHIVE' || e.changeType === 'RESTORE'
                    ? 'field'
                    : 'field';
            if (type === 'stock') {
                const oldV = e.oldValue ? parseInt(e.oldValue, 10) : 0;
                const newV = e.newValue ? parseInt(e.newValue, 10) : 0;
                return {
                    type: 'stock',
                    id: e.id,
                    delta: e.delta ?? newV - oldV,
                    quantityBefore: oldV,
                    quantityAfter: newV,
                    source: e.source ?? 'MANUAL',
                    note: e.note,
                    createdAt: e.createdAt,
                    user: mapUser(e.user),
                };
            }
            const displayVal = e.changeType === 'ARCHIVE'
                ? 'В архив'
                : e.changeType === 'RESTORE'
                    ? 'Восстановлен'
                    : e.newValue;
            return {
                type: 'field',
                id: e.id,
                field: e.fieldName ?? '',
                oldValue: e.oldValue,
                newValue: displayVal,
                createdAt: e.createdAt,
                user: mapUser(e.user),
            };
        });
        const fromStock = stockEntries.map((e) => ({
            type: 'stock',
            id: e.id,
            delta: e.delta,
            quantityBefore: e.quantityBefore,
            quantityAfter: e.quantityAfter,
            source: e.source,
            note: e.note,
            createdAt: e.createdAt,
            user: mapUser(e.user),
        }));
        const fromField = fieldEntries.map((e) => ({
            type: 'field',
            id: e.id,
            field: e.field,
            oldValue: e.oldValue,
            newValue: e.newValue,
            createdAt: e.createdAt,
            user: mapUser(e.user),
        }));
        const seen = new Set();
        const merged = [...fromChange];
        for (const e of [...fromStock, ...fromField]) {
            if (!seen.has(e.id)) {
                seen.add(e.id);
                merged.push(e);
            }
        }
        return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        stock_service_1.StockService,
        crypto_service_1.CryptoService,
        subscriptions_service_1.SubscriptionsService,
        event_emitter_1.EventEmitter2])
], ProductsService);
//# sourceMappingURL=products.service.js.map