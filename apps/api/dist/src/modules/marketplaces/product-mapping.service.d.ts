import { PrismaService } from '../../common/database/prisma.service';
import { MarketplaceType } from '@prisma/client';
export declare class ProductMappingService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findProductByExternalId(userId: string, marketplace: MarketplaceType, externalSystemId: string): Promise<{
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
    } | null>;
    getMappingsForProduct(productId: string, userId: string): Promise<{
        id: string;
        userId: string;
        marketplace: import(".prisma/client").$Enums.MarketplaceType;
        isActive: boolean;
        productId: string;
        externalSystemId: string;
        externalGroupId: string | null;
        externalArticle: string | null;
        syncStock: boolean;
    }[]>;
    getExternalId(productId: string, userId: string, marketplace: MarketplaceType): Promise<string | null>;
    getOzonMapping(productId: string, userId: string): Promise<{
        externalSystemId: string;
        externalArticle?: string | null;
    } | null>;
    getOzonMappingForUserIds(productId: string, userIds: string[], preferredArticle?: string): Promise<{
        externalSystemId: string;
        externalArticle?: string | null;
    } | null>;
    getExternalIdForUserIds(productId: string, userIds: string[], marketplace: MarketplaceType): Promise<string | null>;
    getWbNmId(productId: string, userId: string): Promise<number | null>;
    updateExternalId(productId: string, userId: string, marketplace: MarketplaceType, newExternalSystemId: string, options?: {
        externalArticle?: string;
    }): Promise<void>;
    updateOzonMappingForUserIds(productId: string, userIds: string[], newExternalSystemId: string, newExternalArticle: string): Promise<boolean>;
    private doUpdateExternalId;
    deleteMapping(productId: string, userIds: string[], marketplace: MarketplaceType, externalSystemId: string): Promise<boolean>;
    upsertMapping(productId: string, userId: string, marketplace: MarketplaceType, externalSystemId: string, options?: {
        externalArticle?: string;
        externalGroupId?: string;
    }): Promise<{
        id: string;
        userId: string;
        marketplace: import(".prisma/client").$Enums.MarketplaceType;
        isActive: boolean;
        productId: string;
        externalSystemId: string;
        externalGroupId: string | null;
        externalArticle: string | null;
        syncStock: boolean;
    }>;
}
