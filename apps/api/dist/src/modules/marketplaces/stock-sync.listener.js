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
exports.StockSyncListener = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const products_service_1 = require("../products/products.service");
const products_service_2 = require("../products/products.service");
const marketplaces_service_1 = require("./marketplaces.service");
let StockSyncListener = class StockSyncListener {
    constructor(productsService, marketplacesService) {
        this.productsService = productsService;
        this.marketplacesService = marketplacesService;
    }
    async handleProductSyncChanged(payload) {
        const { userId, productId } = payload;
        try {
            const product = await this.productsService.findById(userId, productId);
            if (!product)
                return;
            const productData = {
                id: product.id,
                name: product.title,
                description: product.description ?? undefined,
                price: Number(product.price),
                stock: product.stock,
                images: product.imageUrl ? [product.imageUrl] : [],
                sku: product.sku ?? undefined,
                vendorCode: (product.article ?? product.sku ?? '').toString().trim() || undefined,
                brand: product.brand ?? undefined,
                weight: product.weight ?? undefined,
                width: product.width ?? undefined,
                length: product.length ?? undefined,
                height: product.height ?? undefined,
                color: product.color ?? undefined,
                material: product.material ?? undefined,
                craftType: product.craftType ?? undefined,
                countryOfOrigin: product.countryOfOrigin ?? undefined,
                packageContents: product.packageContents ?? undefined,
                richContent: product.richContent ?? undefined,
                itemsPerPack: product.itemsPerPack ?? undefined,
                ozonCategoryId: product.ozonCategoryId ?? undefined,
                ozonTypeId: product.ozonTypeId ?? undefined,
                barcodeOzon: product.barcodeOzon ?? undefined,
                barcode: product.barcodeOzon ?? product.barcodeWb ?? undefined,
            };
            const results = await this.marketplacesService.syncProducts(userId, [productData]);
            const hasErrors = results.some((r) => !r.success || (r.errors?.length ?? 0) > 0);
            if (hasErrors) {
                console.warn('[StockSyncListener] Авто-синхронизация частично не удалась:', JSON.stringify(results));
            }
        }
        catch (err) {
            console.error('[StockSyncListener] Ошибка авто-синхронизации с маркетплейсами:', err);
        }
    }
};
exports.StockSyncListener = StockSyncListener;
__decorate([
    (0, event_emitter_1.OnEvent)(products_service_2.PRODUCT_SYNC_CHANGED_EVENT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StockSyncListener.prototype, "handleProductSyncChanged", null);
exports.StockSyncListener = StockSyncListener = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [products_service_1.ProductsService,
        marketplaces_service_1.MarketplacesService])
], StockSyncListener);
//# sourceMappingURL=stock-sync.listener.js.map