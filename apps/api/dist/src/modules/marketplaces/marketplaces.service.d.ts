import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { ProductsService } from '../products/products.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MarketplaceAdapterFactory } from './adapters/marketplace-adapter.factory';
import type { ProductData, OrderData } from './adapters/base-marketplace.adapter';
import { type OzonCategoryNode, type OzonAttributeInfo } from './adapters/ozon.adapter';
import { ProductMappingService } from './product-mapping.service';
import { WbSupplyService } from './wb-supply.service';
export declare class MarketplacesService {
    private readonly prisma;
    private readonly crypto;
    private readonly adapterFactory;
    private readonly productsService;
    private readonly productMappingService;
    private readonly subscriptionsService;
    private readonly eventEmitter;
    private readonly wbSupplyService;
    constructor(prisma: PrismaService, crypto: CryptoService, adapterFactory: MarketplaceAdapterFactory, productsService: ProductsService, productMappingService: ProductMappingService, subscriptionsService: SubscriptionsService, eventEmitter: EventEmitter2, wbSupplyService: WbSupplyService);
    private getEffectiveUserIds;
    private getMarketplaceConnection;
    findAll(userId: string): Promise<{
        token: undefined;
        refreshToken: undefined;
        statsToken: undefined;
        hasStatsToken: boolean;
        id: string;
        userId: string;
        marketplace: import(".prisma/client").$Enums.MarketplaceType;
        createdAt: Date;
        updatedAt: Date;
        sellerId: string | null;
        warehouseId: string | null;
        expiresAt: Date | null;
        lastSyncAt: Date | null;
        lastError: string | null;
    }[]>;
    connect(userId: string, marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO', token: string, refreshToken?: string, sellerId?: string, warehouseId?: string, statsToken?: string): Promise<{
        id: string;
        userId: string;
        marketplace: import(".prisma/client").$Enums.MarketplaceType;
        createdAt: Date;
        updatedAt: Date;
        token: string | null;
        statsToken: string | null;
        refreshToken: string | null;
        sellerId: string | null;
        warehouseId: string | null;
        expiresAt: Date | null;
        lastSyncAt: Date | null;
        lastError: string | null;
    }>;
    disconnect(userId: string, marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO'): Promise<void>;
    updateWarehouse(userId: string, marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO', warehouseId: string | null): Promise<{
        id: string;
        userId: string;
        marketplace: import(".prisma/client").$Enums.MarketplaceType;
        createdAt: Date;
        updatedAt: Date;
        token: string | null;
        statsToken: string | null;
        refreshToken: string | null;
        sellerId: string | null;
        warehouseId: string | null;
        expiresAt: Date | null;
        lastSyncAt: Date | null;
        lastError: string | null;
    }>;
    updateStatsToken(userId: string, marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO', statsToken: string): Promise<{
        id: string;
        userId: string;
        marketplace: import(".prisma/client").$Enums.MarketplaceType;
        createdAt: Date;
        updatedAt: Date;
        token: string | null;
        statsToken: string | null;
        refreshToken: string | null;
        sellerId: string | null;
        warehouseId: string | null;
        expiresAt: Date | null;
        lastSyncAt: Date | null;
        lastError: string | null;
    }>;
    getUserMarketplaces(userId: string): Promise<{
        id: string;
        type: import(".prisma/client").$Enums.MarketplaceType;
        status: string;
        lastSyncAt: Date | null;
        error: string | null;
        createdAt: Date;
    }[]>;
    syncProducts(userId: string, products: ProductData[], marketplaceFilter?: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO'): Promise<({
        marketplace: string;
    } & {
        success: boolean;
        syncedCount: number;
        failedCount: number;
        errors?: string[];
    })[]>;
    private saveBarcodeFromMarketplace;
    private enrichProductsWithMarketplaceMappings;
    pushOrderStatus(userId: string, marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO', payload: {
        marketplaceOrderId: string;
        status: string;
        wbStickerNumber?: string;
        wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
    }): Promise<void>;
    private getWbAdapterAndSupply;
    getWbSupplyInfo(userId: string): Promise<{
        supplyId: string;
        trbxes: Array<{
            id: string;
        }>;
    } | null>;
    addWbTrbx(userId: string, amount: number): Promise<{
        trbxIds: string[];
    }>;
    getWbTrbxStickers(userId: string, type?: 'svg' | 'png' | 'zplv' | 'zplh'): Promise<{
        supplyId: string;
        stickers: Array<{
            trbxId: string;
            file: string;
        }>;
    }>;
    deliverWbSupply(userId: string): Promise<{
        ok: boolean;
        message?: string;
    }>;
    getWbSupplyBarcode(userId: string, type?: 'svg' | 'png' | 'zplv' | 'zplh'): Promise<{
        barcode: string;
        file: string;
    } | null>;
    getOrdersFromAllMarketplaces(userId: string, since?: Date): Promise<OrderData[]>;
    getOrdersStatsByMarketplace(userId: string, from?: Date, to?: Date): Promise<Record<string, {
        totalOrders: number;
        delivered: number;
        cancelled: number;
        revenue: number;
    }>>;
    syncOrderCosts(userId: string, from?: Date, to?: Date): Promise<{
        updated: number;
        errors: string[];
    }>;
    getLinkedProductsStats(userId: string): Promise<{
        byMarketplace: Record<string, number>;
        totalUnique: number;
    }>;
    getStatistics(userId: string): Promise<{
        statistics: Record<string, {
            totalProducts: number;
            totalOrders: number;
            revenue: number;
            lastSyncAt: Date;
            linkedProductsCount: number;
        }>;
        totalUniqueLinkedProducts: number;
    }>;
    getWbStockForProduct(userId: string, displayId: string): Promise<{
        displayId: string;
        article?: string;
        nmId?: number;
        localStock: number;
        wbStock?: number;
        chrtIdsCount?: number;
        hint?: string;
        error?: string;
    }>;
    forceSyncWbStock(userId: string, displayIdOrArticle: string): Promise<{
        ok: boolean;
        message: string;
        wbStock?: number;
    }>;
    getWbBarcodeForProduct(userId: string, productId: string): Promise<{
        barcode: string;
    } | {
        error: string;
    }>;
    loadAndSaveWbBarcode(userId: string, productId: string): Promise<{
        barcode: string;
    } | {
        error: string;
    }>;
    loadAndSaveOzonBarcode(userId: string, productIdOrArticle: string): Promise<{
        barcode: string;
    } | {
        error: string;
    }>;
    getOzonCategoryTree(userId: string): Promise<OzonCategoryNode[]>;
    getOzonWarehouseList(userId: string): Promise<Array<{
        warehouse_id: number;
        name?: string;
    }>>;
    getOzonCategoryAttributes(userId: string, descriptionCategoryId: number, typeId: number): Promise<OzonAttributeInfo[]>;
    validateProductForOzon(product: {
        title?: string | null;
        imageUrl?: string | null;
        price?: unknown;
        article?: string | null;
        sku?: string | null;
        weight?: number | null;
        width?: number | null;
        length?: number | null;
        height?: number | null;
        ozonCategoryId?: number | null;
        ozonTypeId?: number | null;
    }): {
        valid: boolean;
        errors: string[];
    };
    getOzonProductCheck(userId: string, productIdOrArticle: string): Promise<{
        exists: boolean;
        hint: string;
        ozonProductId?: undefined;
        offerIdsTried?: undefined;
        debug?: undefined;
    } | {
        exists: boolean;
        ozonProductId: string | undefined;
        offerIdsTried: string[];
        hint: string;
        debug: {
            rawByProductId: {
                item: Record<string, unknown>;
                raw: unknown;
            } | null;
            rawByOfferId: {
                item: Record<string, unknown>;
                raw: unknown;
            } | null;
        };
    } | {
        hint?: string | undefined;
        exists: boolean;
        ozonProductId: string;
        offer_id: string | null;
        name: string | null;
        barcode: string | null;
        link: string;
        localStock: number;
        warehouseId: string | null;
        warehouseConfigured: boolean;
        offerIdsTried?: undefined;
        debug?: undefined;
    }>;
    getOzonStockForProduct(userId: string, displayIdOrArticle: string): Promise<{
        article?: string;
        displayId: string;
        localStock: number;
        ozonProductId?: string;
        offer_id?: string | null;
        warehouseId?: string | null;
        warehouseConfigured: boolean;
        error?: string;
    }>;
    deleteOzonMapping(userId: string, productIdOrArticle: string, externalSystemId: string): Promise<{
        success: true;
    } | {
        success: false;
        error: string;
    }>;
    refreshOzonMapping(userId: string, productIdOrArticle: string): Promise<{
        success: true;
        product_id: string;
        offer_id: string;
    } | {
        success: false;
        error: string;
    }>;
    forceSyncOzonStock(userId: string, displayIdOrArticle: string): Promise<{
        ok: boolean;
        message: string;
    }>;
    ozonStockDebugStepByStep(userId: string, displayIdOrArticle: string): Promise<Record<string, unknown>>;
    getOzonOfferIdByProductId(userId: string, ozonProductId: string): Promise<string | null>;
    testOzonConnection(userId: string): Promise<{
        ok: boolean;
        hasConnection: boolean;
        hasSellerId: boolean;
        message?: string;
        lastError?: string | null;
    }>;
    getOzonProductDebug(userId: string, productId: string): Promise<{
        error: string;
        productName?: undefined;
        handyseller?: undefined;
        mapping?: undefined;
        ozon?: undefined;
        barcodes?: undefined;
        syncWillUseOfferId?: undefined;
        match?: undefined;
        allMappings?: undefined;
        effectiveUserIds?: undefined;
    } | {
        productName: string;
        handyseller: {
            productId: string;
            displayId: string;
            article: string | null;
            sku: string | null;
        };
        mapping: {
            externalSystemId: string;
            externalArticle: string | null;
        };
        ozon: {
            product_id: string;
            offer_id: string | null;
            name: string | null;
            barcode: string | null;
            barcodes: {} | null;
        };
        barcodes: {
            barcodeWb: string | null;
            barcodeOzon: string | null;
        };
        syncWillUseOfferId: string | null;
        match: boolean;
        allMappings: {
            userId: string;
            marketplace: import(".prisma/client").$Enums.MarketplaceType;
            externalSystemId: string;
            externalArticle: string | null;
            syncStock: boolean;
        }[];
        effectiveUserIds: string[];
        error?: undefined;
    }>;
    getOzonExportDiagnostic(userId: string, productId: string): Promise<{
        success: boolean;
        productId?: string;
        error?: string;
        ozonResponse?: unknown;
    } | {
        success: boolean;
        error: string;
        validationErrors: string[];
    }>;
    getOzonExportPreview(userId: string, productId: string): Promise<{
        error: string;
        validation?: undefined;
        payload?: undefined;
        mapping?: undefined;
        category?: undefined;
        requiredAttributesFromOzon?: undefined;
        missingRequiredAttributes?: undefined;
        timingNote?: undefined;
    } | {
        error: string;
        validation: {
            valid: boolean;
            errors: string[];
        };
        payload?: undefined;
        mapping?: undefined;
        category?: undefined;
        requiredAttributesFromOzon?: undefined;
        missingRequiredAttributes?: undefined;
        timingNote?: undefined;
    } | {
        payload: Record<string, unknown>;
        mapping: Record<string, {
            our: unknown;
            ozon: unknown;
        }>;
        category: {
            descriptionCategoryId: number;
            typeId: number;
        };
        requiredAttributesFromOzon: {
            id: number;
            name: string | undefined;
            is_required: boolean | undefined;
        }[];
        missingRequiredAttributes: {
            id: number;
            name: string | undefined;
        }[];
        validation: {
            valid: boolean;
            errors: string[];
        };
        timingNote: string;
        error?: undefined;
    }>;
    getWbOrderStatus(userId: string, orderIdOrSrid: string): Promise<{
        error: string;
        wb?: undefined;
        ourDb?: undefined;
        mappedStatus?: undefined;
    } | {
        wb: {
            found: boolean;
            orderId?: number;
            srid?: string;
            wbStatus?: string;
            supplierStatus?: string;
            orderStatus?: string | number;
            raw?: Record<string, unknown>;
        };
        ourDb: {
            id: string;
            externalId: string;
            status: import(".prisma/client").$Enums.OrderStatus;
            rawStatus: string | null;
            wbStickerNumber: string | null;
        } | null;
        mappedStatus: string | null;
        error?: undefined;
    }>;
    getWbOrderSticker(userId: string, wbOrderId: string): Promise<{
        file: string;
    } | {
        error: string;
    }>;
    getDecryptedToken(conn: {
        token: string | null;
        refreshToken: string | null;
    }): {
        token: string | null;
        refreshToken: string | null;
    };
    importProductsFromMarketplace(userId: string, marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO'): Promise<{
        imported: number;
        skipped: number;
        articlesUpdated?: number;
        errors: string[];
    }>;
    private importFromOzon;
}
