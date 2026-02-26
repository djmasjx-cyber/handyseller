export declare enum MarketplaceType {
    WILDBERRIES = "WILDBERRIES",
    OZON = "OZON",
    YANDEX = "YANDEX",
    AVITO = "AVITO"
}
export declare class ConnectMarketplaceDto {
    marketplace: MarketplaceType;
    apiKey?: string;
    token?: string;
    refreshToken?: string;
    sellerId?: string;
    warehouseId?: string;
    statsToken?: string;
    shopName?: string;
}
export type MarketplaceSlug = MarketplaceType;
