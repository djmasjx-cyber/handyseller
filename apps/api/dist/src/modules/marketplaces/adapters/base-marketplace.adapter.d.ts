import { CryptoService } from '../../../common/crypto/crypto.service';
import type { CanonicalProduct } from '../canonical/canonical-product.types';
export type PlatformProductPayload = Record<string, unknown>;
export interface ProductSynchronizerInterface {
    convertToPlatform(canonical: CanonicalProduct): PlatformProductPayload | Promise<PlatformProductPayload>;
}
export interface ProductData {
    id: string;
    name: string;
    description?: string;
    price: number;
    stock: number;
    images: string[];
    barcode?: string;
    vendorCode?: string;
    brand?: string;
    weight?: number;
    width?: number;
    length?: number;
    height?: number;
    productUrl?: string;
    color?: string;
    itemsPerPack?: number;
    material?: string;
    craftType?: string;
    countryOfOrigin?: string;
    packageContents?: string;
    richContent?: string;
    categoryId?: string;
    characteristics?: Record<string, unknown>;
    ozonCategoryId?: number;
    ozonTypeId?: number;
    sku?: string;
    wbNmId?: number;
    ozonProductId?: string;
    barcodeOzon?: string;
    yandexProductId?: string;
    avitoProductId?: string;
}
export interface OrderData {
    id: string;
    marketplaceOrderId: string;
    productId: string;
    quantity?: number;
    productName?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    deliveryAddress?: string;
    status: string;
    amount: number;
    createdAt: Date;
    marketplace?: string;
    warehouseName?: string;
    rawStatus?: string;
    rawSupplierStatus?: string;
    processingTimeMin?: number;
    wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
}
export interface SyncResult {
    success: boolean;
    syncedCount: number;
    failedCount: number;
    errors?: string[];
    createdMappings?: Array<{
        productId: string;
        externalSystemId: string;
        externalArticle?: string;
    }>;
}
export interface MarketplaceConfig {
    apiKey: string;
    sellerId?: string;
    baseUrl: string;
    warehouseId?: string;
    statsToken?: string;
}
export declare abstract class BaseMarketplaceAdapter implements ProductSynchronizerInterface {
    protected readonly crypto: CryptoService;
    protected config: MarketplaceConfig;
    constructor(crypto: CryptoService, marketplaceConfig: MarketplaceConfig);
    abstract convertToPlatform(canonical: CanonicalProduct): PlatformProductPayload | Promise<PlatformProductPayload>;
    abstract authenticate(): Promise<boolean>;
    abstract uploadProduct(product: ProductData): Promise<string>;
    abstract updateProduct(marketplaceProductId: string, product: Partial<ProductData>): Promise<boolean>;
    abstract deleteProduct(marketplaceProductId: string): Promise<boolean>;
    abstract getOrders(since?: Date): Promise<OrderData[]>;
    abstract updateOrderStatus(marketplaceOrderId: string, status: string, options?: {
        wbStickerNumber?: string;
        wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
        wbSupplyId?: string;
    }): Promise<boolean>;
    abstract syncProducts(products: ProductData[]): Promise<SyncResult>;
    abstract getStatistics(): Promise<{
        totalProducts: number;
        totalOrders: number;
        revenue: number;
        lastSyncAt: Date;
    }>;
    protected decryptApiKey(encryptedKey: string): string;
    protected logError(error: unknown, context: string): void;
}
