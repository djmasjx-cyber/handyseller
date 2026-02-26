import { MarketplacesService } from './marketplaces.service';
import { ProductsService } from '../products/products.service';
import { ConnectMarketplaceDto } from './dto/connect-marketplace.dto';
import { UpdateStatsTokenDto } from './dto/update-stats-token.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import type { ProductData } from './adapters/base-marketplace.adapter';
import { SyncQueueService } from './sync-queue/sync-queue.service';
export declare class MarketplacesController {
    private readonly marketplacesService;
    private readonly productsService;
    private readonly syncQueueService;
    constructor(marketplacesService: MarketplacesService, productsService: ProductsService, syncQueueService: SyncQueueService);
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
    getUserMarketplaces(userId: string): Promise<{
        id: string;
        type: import(".prisma/client").$Enums.MarketplaceType;
        status: string;
        lastSyncAt: Date | null;
        error: string | null;
        createdAt: Date;
    }[]>;
    connect(userId: string, dto: ConnectMarketplaceDto): Promise<{
        id: string;
        userId: string;
        marketplace: import(".prisma/client").$Enums.MarketplaceType;
        createdAt: Date;
        updatedAt: Date;
        statsToken: string | null;
        sellerId: string | null;
        warehouseId: string | null;
        expiresAt: Date | null;
        lastSyncAt: Date | null;
        lastError: string | null;
    }>;
    updateWarehouse(userId: string, marketplace: string, dto: UpdateWarehouseDto): Promise<{
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
    }>;
    updateStatsToken(userId: string, marketplace: string, dto: UpdateStatsTokenDto): Promise<{
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
    }>;
    disconnect(userId: string, marketplace: string): Promise<{
        success: boolean;
    }>;
    syncProducts(userId: string, body?: {
        products?: ProductData[];
        productIds?: string[];
    }, asyncMode?: string, marketplaceFilter?: string): Promise<import("./sync-queue/sync-queue.service").SyncJobResult | ({
        marketplace: string;
    } & {
        success: boolean;
        syncedCount: number;
        failedCount: number;
        errors?: string[];
    })[]>;
    getSyncStatus(_userId: string, jobId: string): Promise<{
        id: string | undefined;
        state: "unknown" | import("bullmq").JobState;
        progress: import("bullmq").JobProgress;
        data: any;
        result: any;
        failedReason: string;
        finishedOn: number | undefined;
        processedOn: number | undefined;
    }>;
    getOrders(userId: string, since?: string): Promise<import("./adapters/base-marketplace.adapter").OrderData[]>;
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
    getLinkedProductsStats(userId: string): Promise<{
        byMarketplace: Record<string, number>;
        totalUnique: number;
    }>;
    syncOrderCosts(userId: string, body?: {
        from?: string;
        to?: string;
    }): Promise<{
        updated: number;
        errors: string[];
    }>;
    getWbStock(userId: string, displayId: string): Promise<{
        displayId: string;
        article?: string;
        nmId?: number;
        localStock: number;
        wbStock?: number;
        chrtIdsCount?: number;
        hint?: string;
        error?: string;
    }>;
    forceSyncWbStock(userId: string, displayId: string): Promise<{
        ok: boolean;
        message: string;
        wbStock?: number;
    }>;
    getWbBarcode(userId: string, productId: string): Promise<{
        barcode: string;
    } | {
        error: string;
    }>;
    loadWbBarcode(userId: string, productId: string): Promise<{
        barcode: string;
    } | {
        error: string;
    }>;
    getOzonCategories(userId: string): Promise<import("./adapters/ozon.adapter").OzonCategoryNode[]>;
    getOzonWarehouses(userId: string): Promise<{
        warehouse_id: number;
        name?: string;
    }[]>;
    getOzonCategoryAttributes(userId: string, categoryId: string, typeId: string): Promise<import("./adapters/ozon.adapter").OzonAttributeInfo[]>;
    testOzonConnection(userId: string): Promise<{
        ok: boolean;
        hasConnection: boolean;
        hasSellerId: boolean;
        message?: string;
        lastError?: string | null;
    }>;
    getOzonStock(userId: string, displayIdOrArticle: string): Promise<{
        article?: string;
        displayId: string;
        localStock: number;
        ozonProductId?: string;
        offer_id?: string | null;
        warehouseId?: string | null;
        warehouseConfigured: boolean;
        error?: string;
    }>;
    ozonStockDebug(userId: string, role: string, displayIdOrArticle: string, forUserId?: string): Promise<Record<string, unknown>>;
    forceSyncOzonStock(userId: string, displayIdOrArticle: string): Promise<{
        ok: boolean;
        message: string;
    }>;
    getOzonCheck(userId: string, productId: string): Promise<{
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
    validateForOzon(userId: string, productId: string): Promise<{
        valid: boolean;
        errors: string[];
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
    getOzonDebug(userId: string, productId: string): Promise<{
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
    deleteOzonMapping(userId: string, productId: string, body: {
        externalSystemId: string;
    }): Promise<{
        success: true;
    } | {
        success: false;
        error: string;
    }>;
    refreshOzonMapping(userId: string, productId: string): Promise<{
        success: true;
        product_id: string;
        offer_id: string;
    } | {
        success: false;
        error: string;
    }>;
    loadOzonBarcode(userId: string, productId: string): Promise<{
        barcode: string;
    } | {
        error: string;
    }>;
    getWbSupplyInfo(userId: string): Promise<{
        supplyId: string;
        trbxes: Array<{
            id: string;
        }>;
    } | null>;
    addWbTrbx(userId: string, body: {
        amount?: number;
    }): Promise<{
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
    }>;
    importProducts(userId: string, body: {
        marketplace?: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO';
    }): Promise<{
        imported: number;
        skipped: number;
        articlesUpdated?: number;
        errors: string[];
    }>;
}
