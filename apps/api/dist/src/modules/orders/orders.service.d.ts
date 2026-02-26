import { PrismaService } from '../../common/database/prisma.service';
import { MarketplacesService } from '../marketplaces/marketplaces.service';
import { ProductMappingService } from '../marketplaces/product-mapping.service';
import { ProductsService } from '../products/products.service';
import { StockService } from '../products/stock.service';
import { OrderStatus } from '@prisma/client';
export declare class OrdersService {
    private prisma;
    private marketplacesService;
    private productMappingService;
    private productsService;
    private stockService;
    constructor(prisma: PrismaService, marketplacesService: MarketplacesService, productMappingService: ProductMappingService, productsService: ProductsService, stockService: StockService);
    getOrderStats(userId: string): Promise<{
        newCount: number;
        inProgressCount: number;
    }>;
    findAll(userId: string): Promise<{
        processingTimeMin: number | null;
        items: ({
            product: {
                id: string;
                userId: string;
                createdAt: Date;
                updatedAt: Date;
                length: number | null;
                material: string | null;
                displayId: number;
                title: string;
                description: string | null;
                price: import("@prisma/client/runtime/library").Decimal;
                imageUrl: string | null;
                sku: string | null;
                article: string | null;
                stock: number;
                seoTitle: string | null;
                seoKeywords: string | null;
                seoDescription: string | null;
                barcodeWb: string | null;
                barcodeOzon: string | null;
                brand: string | null;
                weight: number | null;
                width: number | null;
                height: number | null;
                productUrl: string | null;
                color: string | null;
                itemsPerPack: number | null;
                craftType: string | null;
                countryOfOrigin: string | null;
                packageContents: string | null;
                richContent: string | null;
                ozonCategoryId: number | null;
                ozonTypeId: number | null;
                ozonCategoryPath: string | null;
                archivedAt: Date | null;
            };
        } & {
            id: string;
            createdAt: Date;
            quantity: number;
            price: import("@prisma/client/runtime/library").Decimal;
            productId: string;
            orderId: string;
            productBarcodeWb: string | null;
            productBarcodeOzon: string | null;
        })[];
        processingTime: {
            id: string;
            processingTimeMin: number;
            source: string;
            orderId: string;
            calculatedAt: Date;
        } | null;
        id: string;
        userId: string;
        marketplace: import(".prisma/client").$Enums.MarketplaceType;
        externalId: string;
        status: import(".prisma/client").$Enums.OrderStatus;
        totalAmount: import("@prisma/client/runtime/library").Decimal;
        warehouseName: string | null;
        rawStatus: string | null;
        holdUntil: Date | null;
        createdAt: Date;
        updatedAt: Date;
        wbStickerNumber: string | null;
        ozonPostingNumber: string | null;
        wbFulfillmentType: import(".prisma/client").$Enums.WbFulfillmentType | null;
        logisticsCost: import("@prisma/client/runtime/library").Decimal | null;
        commissionAmount: import("@prisma/client/runtime/library").Decimal | null;
        costsSyncedAt: Date | null;
    }[]>;
    getWbStickerImage(userId: string, orderId: string): Promise<{
        file: string;
    } | {
        error: string;
    }>;
    getWbOrderStatusDebug(userId: string, orderIdOrSrid: string): Promise<{
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
    getRawOrdersFromWb(userId: string): Promise<{
        ordersFromWb: import("../marketplaces/adapters/base-marketplace.adapter").OrderData[];
        productsCount: number;
        productSamples: {
            id: string;
            sku: string | null;
            article: string | null;
        }[];
    }>;
    updateStatus(userId: string, orderId: string, status: OrderStatus): Promise<{
        id: string;
        userId: string;
        marketplace: import(".prisma/client").$Enums.MarketplaceType;
        externalId: string;
        status: import(".prisma/client").$Enums.OrderStatus;
        totalAmount: import("@prisma/client/runtime/library").Decimal;
        warehouseName: string | null;
        rawStatus: string | null;
        processingTimeMin: number | null;
        holdUntil: Date | null;
        createdAt: Date;
        updatedAt: Date;
        wbStickerNumber: string | null;
        ozonPostingNumber: string | null;
        wbFulfillmentType: import(".prisma/client").$Enums.WbFulfillmentType | null;
        logisticsCost: import("@prisma/client/runtime/library").Decimal | null;
        commissionAmount: import("@prisma/client/runtime/library").Decimal | null;
        costsSyncedAt: Date | null;
    } | null>;
    retryStockReserveByExternalId(orderIdOrExternalId: string): Promise<{
        ok: boolean;
        reserved: number;
        message?: string;
    }>;
    retryStockReserve(userId: string, orderIdOrExternalId: string): Promise<{
        ok: boolean;
        reserved: number;
        message?: string;
    }>;
    retryPushOrderStatus(userId: string, orderId: string): Promise<{
        ok: boolean;
        message?: string;
    }>;
    processHoldExpiredOrders(userId?: string): Promise<{
        processed: number;
        skipped: number;
        errors: string[];
    }>;
    syncFromMarketplaces(userId: string, since?: Date): Promise<{
        synced: number;
        skipped: number;
        errors: string[];
    }>;
    private mapStatus;
    private findProductByMarketplaceId;
}
