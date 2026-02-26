import { OrdersService } from './orders.service';
export declare class OrdersController {
    private ordersService;
    constructor(ordersService: OrdersService);
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
    sync(userId: string, since?: string): Promise<{
        synced: number;
        skipped: number;
        errors: string[];
    }>;
    getWbRaw(userId: string): Promise<{
        ordersFromWb: import("../marketplaces/adapters/base-marketplace.adapter").OrderData[];
        productsCount: number;
        productSamples: {
            id: string;
            sku: string | null;
            article: string | null;
        }[];
    }>;
    getWbStatus(userId: string, orderId: string): Promise<{
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
    getWbSticker(userId: string, orderId: string): Promise<{
        file: string;
    } | {
        error: string;
    }>;
    retryWbPush(userId: string, orderId: string): Promise<{
        ok: boolean;
        message?: string;
    }>;
    retryStockReserve(userId: string, orderId?: string, externalId?: string): Promise<{
        ok: boolean;
        reserved: number;
        message?: string;
    }>;
    updateStatus(userId: string, orderId: string, status: string): Promise<{
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
}
