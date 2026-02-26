import { HttpService } from '@nestjs/axios';
import { BaseMarketplaceAdapter, ProductData, OrderData, SyncResult, MarketplaceConfig, PlatformProductPayload } from './base-marketplace.adapter';
import type { CanonicalProduct } from '../canonical/canonical-product.types';
import { CryptoService } from '../../../common/crypto/crypto.service';
export interface OzonCategoryNode {
    description_category_id: number;
    category_name: string;
    disabled?: boolean;
    type_id?: number;
    type_name?: string;
    children?: OzonCategoryNode[];
}
export interface OzonAttributeInfo {
    id: number;
    name?: string;
    description?: string;
    type?: string;
    is_collection?: boolean;
    is_required?: boolean;
    group_id?: number;
    group_name?: string;
    dictionary_id?: number;
}
export declare class OzonAdapter extends BaseMarketplaceAdapter {
    private readonly logger;
    private readonly API_BASE;
    private readonly httpService;
    constructor(crypto: CryptoService, httpService: HttpService, config: MarketplaceConfig);
    convertToPlatform(canonical: CanonicalProduct): PlatformProductPayload;
    authenticate(): Promise<boolean>;
    private extractOzonErrorFromResponse;
    private extractOzonError;
    private generateEan13;
    private sanitizeOfferId;
    private ozonHeaders;
    getWarehouseList(): Promise<Array<{
        warehouse_id: number;
        name?: string;
    }>>;
    getCategoryTree(): Promise<OzonCategoryNode[]>;
    getCategoryAttributes(descriptionCategoryId: number, typeId: number): Promise<OzonAttributeInfo[]>;
    private mapAttributeToValue;
    buildImportPayload(product: ProductData, requiredAttributes?: OzonAttributeInfo[]): {
        item: Record<string, unknown>;
        mapping: Record<string, {
            our: unknown;
            ozon: unknown;
        }>;
        offerId: string;
        descriptionCategoryId: number;
        typeId: number;
        attributeIds: number[];
    };
    tryImportWithFullResponse(product: ProductData): Promise<{
        success: boolean;
        productId?: string;
        error?: string;
        ozonResponse?: unknown;
    }>;
    uploadProduct(product: ProductData): Promise<string>;
    private collectOzonErrors;
    private extractOzonImportError;
    private extractOzonErrorFromAxios;
    private findProductIdByOfferId;
    getProductStocks(offerIds: string[]): Promise<{
        items: Array<{
            offer_id?: string;
            product_id?: number;
            stock?: number;
            warehouse_id?: number;
        }>;
    }>;
    setStockWithResponse(offerId: string, productId: string, stock: number): Promise<{
        request: object;
        response: unknown;
        status: number;
    }>;
    private setStock;
    updateProduct(marketplaceProductId: string, product: Partial<ProductData>): Promise<boolean>;
    deleteProduct(marketplaceProductId: string): Promise<boolean>;
    getOrders(since?: Date): Promise<OrderData[]>;
    getOrderCostsFromFinance(dateFrom: Date, dateTo: Date, postingNumbers?: string[]): Promise<Map<string, {
        logisticsCost: number;
        commissionAmount: number;
    }>>;
    updateOrderStatus(marketplaceOrderId: string, status: string, _options?: {
        wbStickerNumber?: string;
        wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
        wbSupplyId?: string;
    }): Promise<boolean>;
    generateBarcodes(productIds: string[]): Promise<void>;
    getBarcodeByProductId(ozonProductId: string, offerId?: string): Promise<string | null>;
    private extractBarcode;
    getProductInfoByProductId(ozonProductId: string): Promise<{
        id?: number;
        offer_id?: string;
        barcode?: string;
        barcodes?: string[] | Array<{
            barcode?: string;
        }>;
        name?: string;
    } | null>;
    getProductInfoByProductIdWithRaw(ozonProductId: string): Promise<{
        item: Record<string, unknown>;
        raw: unknown;
    } | null>;
    getProductInfoByOfferId(offerId: string): Promise<{
        id?: number;
        offer_id?: string;
        name?: string;
        barcode?: string;
        barcodes?: string[] | Array<{
            barcode?: string;
        }>;
    } | null>;
    getProductInfoByOfferIdWithRaw(offerId: string): Promise<{
        item: Record<string, unknown>;
        raw: unknown;
    } | null>;
    getProductsFromOzon(): Promise<Array<{
        productId: number;
        offerId: string;
        name: string;
        description?: string;
        imageUrl?: string;
        price?: number;
        barcode?: string;
        weight?: number;
        width?: number;
        height?: number;
        length?: number;
        ozonCategoryId?: number;
        ozonTypeId?: number;
    }>>;
    syncProducts(products: ProductData[]): Promise<SyncResult>;
    getStatistics(): Promise<{
        totalProducts: number;
        totalOrders: number;
        revenue: number;
        lastSyncAt: Date;
    }>;
}
