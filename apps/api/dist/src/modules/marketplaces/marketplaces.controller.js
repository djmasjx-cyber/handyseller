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
exports.MarketplacesController = void 0;
const common_1 = require("@nestjs/common");
const marketplaces_service_1 = require("./marketplaces.service");
const products_service_1 = require("../products/products.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const connect_marketplace_dto_1 = require("./dto/connect-marketplace.dto");
const update_stats_token_dto_1 = require("./dto/update-stats-token.dto");
const update_warehouse_dto_1 = require("./dto/update-warehouse.dto");
const canonical_1 = require("./canonical");
const sync_queue_service_1 = require("./sync-queue/sync-queue.service");
let MarketplacesController = class MarketplacesController {
    constructor(marketplacesService, productsService, syncQueueService) {
        this.marketplacesService = marketplacesService;
        this.productsService = productsService;
        this.syncQueueService = syncQueueService;
    }
    async findAll(userId) {
        return this.marketplacesService.findAll(userId);
    }
    async getUserMarketplaces(userId) {
        return this.marketplacesService.getUserMarketplaces(userId);
    }
    async connect(userId, dto) {
        const credential = dto.apiKey ?? dto.token;
        if (!credential) {
            throw new common_1.BadRequestException('Укажите apiKey или token');
        }
        const conn = await this.marketplacesService.connect(userId, dto.marketplace, credential, dto.refreshToken, dto.sellerId, dto.warehouseId, dto.statsToken);
        const { token, refreshToken, ...safe } = conn;
        return safe;
    }
    async updateWarehouse(userId, marketplace, dto) {
        const api = marketplace.toUpperCase();
        const conn = await this.marketplacesService.updateWarehouse(userId, api, dto.warehouseId ?? null);
        const { token, refreshToken, statsToken, ...safe } = conn;
        return safe;
    }
    async updateStatsToken(userId, marketplace, dto) {
        const api = marketplace.toUpperCase();
        const conn = await this.marketplacesService.updateStatsToken(userId, api, dto.statsToken);
        const { token, refreshToken, statsToken, ...safe } = conn;
        return safe;
    }
    async disconnect(userId, marketplace) {
        const api = marketplace.toUpperCase();
        await this.marketplacesService.disconnect(userId, api);
        return { success: true };
    }
    async syncProducts(userId, body, asyncMode, marketplaceFilter) {
        const mp = marketplaceFilter?.trim()?.toUpperCase();
        const marketplace = ['WILDBERRIES', 'OZON', 'YANDEX', 'AVITO'].includes(mp ?? '')
            ? mp
            : undefined;
        let products;
        if (body?.products?.length) {
            products = body.products;
        }
        else if (body?.productIds?.length) {
            const dbProducts = await Promise.all(body.productIds.map((id) => this.productsService.findByIdWithMappings(userId, id)));
            const validProducts = dbProducts.filter((p) => p != null);
            const canonical = validProducts.map((p) => (0, canonical_1.productToCanonical)(p));
            products = canonical.map((c) => (0, canonical_1.canonicalToProductData)(c));
            if (marketplace === 'OZON' && validProducts.length > 0) {
                const byId = new Map(validProducts.map((p) => [p.id, p]));
                for (const p of products) {
                    const db = byId.get(p.id);
                    if (db) {
                        p.barcodeOzon = db.barcodeOzon;
                        p.barcode = p.barcodeOzon ?? undefined;
                    }
                }
            }
        }
        else {
            const dbProducts = await this.productsService.findAll(userId);
            const canonical = dbProducts.map((p) => (0, canonical_1.productToCanonical)(p));
            products = canonical.map((c) => (0, canonical_1.canonicalToProductData)(c));
            if (marketplace === 'OZON' && dbProducts.length > 0) {
                const byId = new Map(dbProducts.map((p) => [p.id, p]));
                for (const p of products) {
                    const db = byId.get(p.id);
                    if (db) {
                        p.barcodeOzon = db.barcodeOzon;
                        p.barcode = p.barcodeOzon ?? undefined;
                    }
                }
            }
        }
        if (marketplace === 'OZON' && products.length > 0) {
            const validationErrors = [];
            for (const p of products) {
                const dbProduct = await this.productsService.findById(userId, p.id);
                if (dbProduct) {
                    const v = this.marketplacesService.validateProductForOzon(dbProduct);
                    if (!v.valid) {
                        validationErrors.push(`${p.name || 'Товар'}: ${v.errors.join('; ')}`);
                    }
                }
            }
            if (validationErrors.length > 0) {
                throw new common_1.BadRequestException({
                    message: 'Перед выгрузкой на Ozon заполните обязательные поля',
                    errors: validationErrors,
                });
            }
        }
        if (asyncMode === '1' || asyncMode === 'true') {
            return this.syncQueueService.addSyncJob(userId, products, marketplace);
        }
        return this.marketplacesService.syncProducts(userId, products, marketplace);
    }
    async getSyncStatus(_userId, jobId) {
        const status = await this.syncQueueService.getJobStatus(jobId);
        if (!status)
            throw new common_1.BadRequestException('Задача не найдена');
        return status;
    }
    async getOrders(userId, since) {
        const sinceDate = since ? new Date(since) : undefined;
        return this.marketplacesService.getOrdersFromAllMarketplaces(userId, sinceDate);
    }
    async getStatistics(userId) {
        return this.marketplacesService.getStatistics(userId);
    }
    async getLinkedProductsStats(userId) {
        return this.marketplacesService.getLinkedProductsStats(userId);
    }
    async syncOrderCosts(userId, body) {
        const from = body?.from ? new Date(body.from) : undefined;
        const to = body?.to ? new Date(body.to) : undefined;
        return this.marketplacesService.syncOrderCosts(userId, from, to);
    }
    async getWbStock(userId, displayId) {
        return this.marketplacesService.getWbStockForProduct(userId, displayId);
    }
    async forceSyncWbStock(userId, displayId) {
        return this.marketplacesService.forceSyncWbStock(userId, displayId);
    }
    async getWbBarcode(userId, productId) {
        return this.marketplacesService.getWbBarcodeForProduct(userId, productId);
    }
    async loadWbBarcode(userId, productId) {
        return this.marketplacesService.loadAndSaveWbBarcode(userId, productId);
    }
    async getOzonCategories(userId) {
        return this.marketplacesService.getOzonCategoryTree(userId);
    }
    async getOzonWarehouses(userId) {
        return this.marketplacesService.getOzonWarehouseList(userId);
    }
    async getOzonCategoryAttributes(userId, categoryId, typeId) {
        const cat = parseInt(categoryId, 10);
        const type = parseInt(typeId, 10);
        if (isNaN(cat) || isNaN(type) || cat <= 0 || type <= 0) {
            throw new common_1.BadRequestException('Укажите categoryId и typeId');
        }
        return this.marketplacesService.getOzonCategoryAttributes(userId, cat, type);
    }
    async testOzonConnection(userId) {
        return this.marketplacesService.testOzonConnection(userId);
    }
    async getOzonStock(userId, displayIdOrArticle) {
        return this.marketplacesService.getOzonStockForProduct(userId, displayIdOrArticle);
    }
    async ozonStockDebug(userId, role, displayIdOrArticle, forUserId) {
        const targetUserId = role === 'ADMIN' && forUserId?.trim() ? forUserId.trim() : userId;
        return this.marketplacesService.ozonStockDebugStepByStep(targetUserId, displayIdOrArticle);
    }
    async forceSyncOzonStock(userId, displayIdOrArticle) {
        return this.marketplacesService.forceSyncOzonStock(userId, displayIdOrArticle);
    }
    async getOzonCheck(userId, productId) {
        return this.marketplacesService.getOzonProductCheck(userId, productId);
    }
    async validateForOzon(userId, productId) {
        const product = await this.productsService.findById(userId, productId);
        if (!product)
            throw new common_1.BadRequestException('Товар не найден');
        return this.marketplacesService.validateProductForOzon(product);
    }
    async getOzonExportDiagnostic(userId, productId) {
        return this.marketplacesService.getOzonExportDiagnostic(userId, productId);
    }
    async getOzonExportPreview(userId, productId) {
        return this.marketplacesService.getOzonExportPreview(userId, productId);
    }
    async getOzonDebug(userId, productId) {
        return this.marketplacesService.getOzonProductDebug(userId, productId);
    }
    async deleteOzonMapping(userId, productId, body) {
        if (!body?.externalSystemId?.trim()) {
            throw new common_1.BadRequestException('Укажите externalSystemId (product_id на Ozon)');
        }
        return this.marketplacesService.deleteOzonMapping(userId, productId, body.externalSystemId);
    }
    async refreshOzonMapping(userId, productId) {
        return this.marketplacesService.refreshOzonMapping(userId, productId);
    }
    async loadOzonBarcode(userId, productId) {
        return this.marketplacesService.loadAndSaveOzonBarcode(userId, productId);
    }
    async getWbSupplyInfo(userId) {
        return this.marketplacesService.getWbSupplyInfo(userId);
    }
    async addWbTrbx(userId, body) {
        return this.marketplacesService.addWbTrbx(userId, body.amount ?? 1);
    }
    async getWbTrbxStickers(userId, type) {
        return this.marketplacesService.getWbTrbxStickers(userId, type ?? 'png');
    }
    async deliverWbSupply(userId) {
        return this.marketplacesService.deliverWbSupply(userId);
    }
    async getWbSupplyBarcode(userId, type) {
        const result = await this.marketplacesService.getWbSupplyBarcode(userId, type ?? 'png');
        if (!result)
            throw new common_1.BadRequestException('QR-код недоступен. Сначала сдайте поставку в доставку.');
        return result;
    }
    async importProducts(userId, body) {
        const marketplace = body?.marketplace ?? 'WILDBERRIES';
        try {
            return await this.marketplacesService.importProductsFromMarketplace(userId, marketplace);
        }
        catch (err) {
            if (err instanceof common_1.BadRequestException)
                throw err;
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[MarketplacesController] import error:', msg, err);
            throw new common_1.BadRequestException(msg || 'Ошибка импорта товаров');
        }
    }
};
exports.MarketplacesController = MarketplacesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('user'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getUserMarketplaces", null);
__decorate([
    (0, common_1.Post)('connect'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, connect_marketplace_dto_1.ConnectMarketplaceDto]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "connect", null);
__decorate([
    (0, common_1.Patch)(':marketplace/warehouse'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('marketplace')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_warehouse_dto_1.UpdateWarehouseDto]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "updateWarehouse", null);
__decorate([
    (0, common_1.Patch)(':marketplace/stats-token'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('marketplace')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_stats_token_dto_1.UpdateStatsTokenDto]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "updateStatsToken", null);
__decorate([
    (0, common_1.Delete)(':marketplace'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('marketplace')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "disconnect", null);
__decorate([
    (0, common_1.Post)('sync'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Query)('async')),
    __param(3, (0, common_1.Query)('marketplace')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "syncProducts", null);
__decorate([
    (0, common_1.Get)('sync/status/:jobId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getSyncStatus", null);
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Query)('since')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getOrders", null);
__decorate([
    (0, common_1.Get)('statistics'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getStatistics", null);
__decorate([
    (0, common_1.Get)('linked-products-stats'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getLinkedProductsStats", null);
__decorate([
    (0, common_1.Post)('order-costs/sync'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "syncOrderCosts", null);
__decorate([
    (0, common_1.Get)('wb-stock/:displayId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('displayId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getWbStock", null);
__decorate([
    (0, common_1.Post)('wb-stock/:displayId/sync'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('displayId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "forceSyncWbStock", null);
__decorate([
    (0, common_1.Get)('wb-barcode/:productId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getWbBarcode", null);
__decorate([
    (0, common_1.Post)('wb-barcode/:productId/load'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "loadWbBarcode", null);
__decorate([
    (0, common_1.Get)('ozon/categories'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getOzonCategories", null);
__decorate([
    (0, common_1.Get)('ozon/warehouses'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getOzonWarehouses", null);
__decorate([
    (0, common_1.Get)('ozon/categories/attributes'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Query)('categoryId')),
    __param(2, (0, common_1.Query)('typeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getOzonCategoryAttributes", null);
__decorate([
    (0, common_1.Get)('ozon-test'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "testOzonConnection", null);
__decorate([
    (0, common_1.Get)('ozon-stock/:displayIdOrArticle'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('displayIdOrArticle')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getOzonStock", null);
__decorate([
    (0, common_1.Get)('ozon-stock-debug/:displayIdOrArticle'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('role')),
    __param(2, (0, common_1.Param)('displayIdOrArticle')),
    __param(3, (0, common_1.Query)('forUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "ozonStockDebug", null);
__decorate([
    (0, common_1.Post)('ozon-stock/:displayIdOrArticle/sync'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('displayIdOrArticle')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "forceSyncOzonStock", null);
__decorate([
    (0, common_1.Get)('ozon-check/:productId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getOzonCheck", null);
__decorate([
    (0, common_1.Get)('ozon-validate/:productId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "validateForOzon", null);
__decorate([
    (0, common_1.Post)('ozon-export-diagnostic/:productId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getOzonExportDiagnostic", null);
__decorate([
    (0, common_1.Get)('ozon-export-preview/:productId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getOzonExportPreview", null);
__decorate([
    (0, common_1.Get)('ozon-debug/:productId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getOzonDebug", null);
__decorate([
    (0, common_1.Post)('ozon-delete-mapping/:productId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('productId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "deleteOzonMapping", null);
__decorate([
    (0, common_1.Post)('ozon-refresh-mapping/:productId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "refreshOzonMapping", null);
__decorate([
    (0, common_1.Post)('ozon-barcode/:productId/load'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "loadOzonBarcode", null);
__decorate([
    (0, common_1.Get)('wb-supply'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getWbSupplyInfo", null);
__decorate([
    (0, common_1.Post)('wb-supply/trbx'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "addWbTrbx", null);
__decorate([
    (0, common_1.Get)('wb-supply/trbx/stickers'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getWbTrbxStickers", null);
__decorate([
    (0, common_1.Post)('wb-supply/deliver'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "deliverWbSupply", null);
__decorate([
    (0, common_1.Get)('wb-supply/barcode'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "getWbSupplyBarcode", null);
__decorate([
    (0, common_1.Post)('import'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MarketplacesController.prototype, "importProducts", null);
exports.MarketplacesController = MarketplacesController = __decorate([
    (0, common_1.Controller)('marketplaces'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [marketplaces_service_1.MarketplacesService,
        products_service_1.ProductsService,
        sync_queue_service_1.SyncQueueService])
], MarketplacesController);
//# sourceMappingURL=marketplaces.controller.js.map