import { HttpService } from '@nestjs/axios';
import { BaseMarketplaceAdapter, ProductData, OrderData, SyncResult, MarketplaceConfig, PlatformProductPayload } from './base-marketplace.adapter';
import type { CanonicalProduct } from '../canonical/canonical-product.types';
import { CryptoService } from '../../../common/crypto/crypto.service';
export declare class WildberriesAdapter extends BaseMarketplaceAdapter {
    private readonly CONTENT_API;
    private readonly MARKETPLACE_API;
    private readonly STATISTICS_API;
    private readonly PRICES_API;
    private readonly httpService;
    private cachedWarehouseId;
    private chrtIdCache;
    private chrtIdsCache;
    private authHeader;
    constructor(crypto: CryptoService, httpService: HttpService, config: MarketplaceConfig);
    private stripHtml;
    convertToPlatform(canonical: CanonicalProduct): PlatformProductPayload;
    authenticate(): Promise<boolean>;
    uploadProduct(product: ProductData): Promise<string>;
    uploadFromCanonical(canonical: CanonicalProduct): Promise<string>;
    private uploadImages;
    private setPrice;
    private getChrtIdByNmId;
    private getChrtIdsByNmId;
    getBarcodeByNmId(nmId: number): Promise<string | null>;
    private resolveWarehouseId;
    private setStock;
    getChrtIdsForNmId(nmId: number): Promise<number[]>;
    getStocks(nmIds: number[]): Promise<Record<number, number>>;
    updateProduct(marketplaceProductId: string, product: Partial<ProductData>): Promise<boolean>;
    deleteProduct(marketplaceProductId: string): Promise<boolean>;
    getStickers(orderIds: number[]): Promise<Array<{
        orderId: number;
        file: string;
    }>>;
    getOrderStatusFromWb(orderIdOrSrid: string): Promise<{
        found: boolean;
        orderId?: number;
        srid?: string;
        wbStatus?: string;
        supplierStatus?: string;
        orderStatus?: string | number;
        raw?: Record<string, unknown>;
    }>;
    getOrders(since?: Date): Promise<OrderData[]>;
    updateOrderStatus(marketplaceOrderId: string, status: string, options?: {
        wbStickerNumber?: string;
        wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
        wbSupplyId?: string;
    }): Promise<boolean>;
    private resolveWbOrderId;
    private confirmOrderToAssembly;
    private confirmFbsOrder;
    private confirmFbsOrderWithSupply;
    private confirmDbsOrder;
    private confirmDbwOrder;
    private createOrGetActiveSupply;
    private extractWbErrorMessage;
    ensureFbsSupply(): Promise<string | null>;
    addTrbxToSupply(supplyId: string, amount: number): Promise<string[]>;
    getTrbxStickers(supplyId: string, trbxIds: string[], type?: 'svg' | 'png' | 'zplv' | 'zplh'): Promise<Array<{
        trbxId: string;
        file: string;
    }>>;
    deliverSupply(supplyId: string): Promise<boolean>;
    getSupplyBarcode(supplyId: string, type?: 'svg' | 'png' | 'zplv' | 'zplh'): Promise<{
        barcode: string;
        file: string;
    } | null>;
    getSupplyTrbx(supplyId: string): Promise<Array<{
        id: string;
    }>>;
    private mapStatusToWB;
    syncProducts(products: ProductData[]): Promise<SyncResult>;
    getProductsFromWb(): Promise<Array<{
        nmId: number;
        vendorCode: string;
        name: string;
        description?: string;
        imageUrl?: string;
        price?: number;
        brand?: string;
        color?: string;
        weight?: number;
        width?: number;
        length?: number;
        height?: number;
        itemsPerPack?: number;
        countryOfOrigin?: string;
        material?: string;
        craftType?: string;
        packageContents?: string;
        richContent?: string;
    }>>;
    getOrderCostsFromReport(dateFrom: Date, dateTo: Date): Promise<Map<string, {
        logisticsCost: number;
        commissionAmount: number;
    }>>;
    getStatistics(): Promise<{
        totalProducts: number;
        totalOrders: number;
        revenue: number;
        lastSyncAt: Date;
    }>;
}
