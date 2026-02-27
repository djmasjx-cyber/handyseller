import { BadRequestException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { BaseMarketplaceAdapter, MarketplaceConfig } from './base-marketplace.adapter';
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

@Injectable()
export class MarketplaceAdapterFactory {
  constructor(
    private readonly crypto: CryptoService,
    private readonly httpService: HttpService,
  ) {}

  private safeDecrypt(value: string, marketplace: string): string {
    try {
      return this.crypto.decrypt(value);
    } catch {
      throw new BadRequestException(
        `Токен ${marketplace} повреждён после миграции. Переподключите маркетплейс в настройках.`,
      );
    }
  }

  createWildberriesAdapter(connection: ConnectionConfig): WildberriesAdapter {
    const apiKey = this.safeDecrypt(connection.encryptedToken, 'Wildberries');
    const statsToken = connection.encryptedStatsToken
      ? this.safeDecrypt(connection.encryptedStatsToken, 'Wildberries')
      : undefined;
    const config: MarketplaceConfig = {
      apiKey,
      sellerId: connection.sellerId,
      warehouseId: connection.warehouseId,
      statsToken,
      baseUrl: 'https://seller.wildberries.ru',
    };
    return new WildberriesAdapter(this.crypto, this.httpService, config);
  }

  createOzonAdapter(connection: ConnectionConfig): OzonAdapter {
    const apiKey = this.safeDecrypt(connection.encryptedToken, 'Ozon');
    const config: MarketplaceConfig = {
      apiKey,
      sellerId: connection.sellerId, // Client-Id для Ozon
      warehouseId: connection.warehouseId,
      baseUrl: 'https://seller.ozon.ru',
    };
    return new OzonAdapter(this.crypto, this.httpService, config);
  }

  createYandexAdapter(connection: ConnectionConfig): YandexAdapter {
    const apiKey = this.safeDecrypt(connection.encryptedToken, 'Yandex');
    const config: MarketplaceConfig = {
      apiKey,
      sellerId: connection.sellerId, // Campaign ID (businessId) для Яндекса
      baseUrl: 'https://partner.market.yandex.ru',
    };
    return new YandexAdapter(this.crypto, this.httpService, config);
  }

  createAvitoAdapter(connection: ConnectionConfig): AvitoAdapter {
    const apiKey = this.safeDecrypt(connection.encryptedToken, 'Avito');
    const config: MarketplaceConfig = {
      apiKey,
      sellerId: connection.sellerId, // Client-Id для Avito
      baseUrl: 'https://www.avito.ru',
    };
    return new AvitoAdapter(this.crypto, this.httpService, config);
  }

  createAdapter(marketplace: MarketplaceType, connection: ConnectionConfig): BaseMarketplaceAdapter | null {
    if (marketplace === 'WILDBERRIES') return this.createWildberriesAdapter(connection);
    if (marketplace === 'OZON') return this.createOzonAdapter(connection);
    if (marketplace === 'YANDEX') return this.createYandexAdapter(connection);
    if (marketplace === 'AVITO') return this.createAvitoAdapter(connection);
    return null;
  }
}
