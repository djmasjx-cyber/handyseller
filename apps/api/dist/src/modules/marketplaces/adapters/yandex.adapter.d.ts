import { HttpService } from '@nestjs/axios';
import { BaseMarketplaceAdapter, ProductData, OrderData, SyncResult, MarketplaceConfig, PlatformProductPayload } from './base-marketplace.adapter';
import type { CanonicalProduct } from '../canonical/canonical-product.types';
import { CryptoService } from '../../../common/crypto/crypto.service';
export declare class YandexAdapter extends BaseMarketplaceAdapter {
    private readonly API_BASE;
    private readonly httpService;
    constructor(crypto: CryptoService, httpService: HttpService, config: MarketplaceConfig);
    convertToPlatform(canonical: CanonicalProduct): PlatformProductPayload;
    authenticate(): Promise<boolean>;
    uploadProduct(product: ProductData): Promise<string>;
    updateProduct(marketplaceProductId: string, product: Partial<ProductData>): Promise<boolean>;
    deleteProduct(marketplaceProductId: string): Promise<boolean>;
    getOrders(since?: Date): Promise<OrderData[]>;
    private mapYandexStatus;
    updateOrderStatus(marketplaceOrderId: string, status: string, _options?: {
        wbStickerNumber?: string;
        wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
        wbSupplyId?: string;
    }): Promise<boolean>;
    private mapStatusToYandex;
    syncProducts(products: ProductData[]): Promise<SyncResult>;
    getStatistics(): Promise<{
        totalProducts: number;
        totalOrders: number;
        revenue: number;
        lastSyncAt: Date;
    }>;
}
