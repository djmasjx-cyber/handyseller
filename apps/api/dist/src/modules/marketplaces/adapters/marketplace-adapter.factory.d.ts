import { HttpService } from '@nestjs/axios';
import { BaseMarketplaceAdapter } from './base-marketplace.adapter';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { WildberriesAdapter } from './wildberries.adapter';
import { OzonAdapter } from './ozon.adapter';
import { YandexAdapter } from './yandex.adapter';
import { AvitoAdapter } from './avito.adapter';
export type MarketplaceType = 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO';
export interface ConnectionConfig {
    encryptedToken: string;
    encryptedRefreshToken?: string | null;
    encryptedStatsToken?: string | null;
    sellerId?: string;
    warehouseId?: string;
}
export declare class MarketplaceAdapterFactory {
    private readonly crypto;
    private readonly httpService;
    constructor(crypto: CryptoService, httpService: HttpService);
    createWildberriesAdapter(connection: ConnectionConfig): WildberriesAdapter;
    createOzonAdapter(connection: ConnectionConfig): OzonAdapter;
    createYandexAdapter(connection: ConnectionConfig): YandexAdapter;
    createAvitoAdapter(connection: ConnectionConfig): AvitoAdapter;
    createAdapter(marketplace: MarketplaceType, connection: ConnectionConfig): BaseMarketplaceAdapter | null;
}
