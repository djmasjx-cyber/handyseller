import { HttpService } from '@nestjs/axios';
import { BaseMarketplaceAdapter, ProductData, OrderData, SyncResult, MarketplaceConfig, PlatformProductPayload } from './base-marketplace.adapter';
import type { CanonicalProduct } from '../canonical/canonical-product.types';
import { CryptoService } from '../../../common/crypto/crypto.service';
export declare class AvitoAdapter extends BaseMarketplaceAdapter {
    private readonly API_BASE;
    private readonly httpService;
    private accessToken;
    private tokenExpiry;
    constructor(crypto: CryptoService, httpService: HttpService, config: MarketplaceConfig);
    private getAccessToken;
    convertToPlatform(canonical: CanonicalProduct): PlatformProductPayload;
    authenticate(): Promise<boolean>;
    uploadProduct(product: ProductData): Promise<string>;
    updateProduct(marketplaceProductId: string, product: Partial<ProductData>): Promise<boolean>;
    deleteProduct(marketplaceProductId: string): Promise<boolean>;
    getOrders(since?: Date): Promise<OrderData[]>;
    updateOrderStatus(_marketplaceOrderId: string, _status: string, _options?: {
        wbStickerNumber?: string;
        wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
        wbSupplyId?: string;
    }): Promise<boolean>;
    syncProducts(products: ProductData[]): Promise<SyncResult>;
    getStatistics(): Promise<{
        totalProducts: number;
        totalOrders: number;
        revenue: number;
        lastSyncAt: Date;
    }>;
    getItemStats(itemId: string): Promise<unknown>;
}
