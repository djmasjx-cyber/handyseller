import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  BaseMarketplaceAdapter,
  ProductData,
  OrderData,
  SyncResult,
  MarketplaceConfig,
  PlatformProductPayload,
} from './base-marketplace.adapter';
import type { CanonicalProduct } from '../canonical/canonical-product.types';
import { CryptoService } from '../../../common/crypto/crypto.service';

@Injectable()
export class AvitoAdapter extends BaseMarketplaceAdapter {
  private readonly API_BASE = 'https://api.avito.ru';
  private readonly httpService: HttpService;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(
    crypto: CryptoService,
    httpService: HttpService,
    config: MarketplaceConfig,
  ) {
    super(crypto, {
      ...config,
      baseUrl: config.baseUrl || 'https://www.avito.ru',
    });
    this.httpService = httpService;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.config.sellerId || !this.config.apiKey) {
      throw new Error('clientId и clientSecret обязательны для Avito');
    }

    const { data } = await firstValueFrom(
      this.httpService.post(
        'https://oauth.avito.ru/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.sellerId,
          client_secret: this.config.apiKey,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      ),
    );

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
  }

  /**
   * CanonicalProduct → формат Avito API (объявление).
   * Маппинг: title→title, long_description→description, price→price.
   */
  convertToPlatform(canonical: CanonicalProduct): PlatformProductPayload {
    return {
      category_id: 1070,
      price: canonical.price,
      title: canonical.title,
      description: canonical.long_description_plain ?? canonical.short_description ?? '',
      address: { region_id: 1, city_id: 621540 },
      contacts: { name: 'Мастер' },
      images: canonical.images?.map((i) => ({ url: i.url })) ?? [],
      param: canonical.attributes?.map((a) => ({ name: a.name, value: a.value })) ?? [],
    };
  }

  async authenticate(): Promise<boolean> {
    try {
      await this.getAccessToken();
      return true;
    } catch (error) {
      this.logError(error, 'authenticate');
      return false;
    }
  }

  async uploadProduct(product: ProductData): Promise<string> {
    try {
      const token = await this.getAccessToken();

      const avitoProduct = {
        category_id: 1070,
        price: product.price,
        title: product.name,
        description: product.description || '',
        address: { region_id: 1, city_id: 621540 },
        contacts: { name: 'Мастер' },
        images: product.images.map((img) => ({ url: img })),
        tags: ['ручная работа', 'хендмейд', 'уникально', 'подарок'],
        attributes: [
          { id: 1001, value: 'Ручная работа' },
          { id: 1002, value: 'Россия' },
        ],
      };

      const { data } = await firstValueFrom(
        this.httpService.post(`${this.API_BASE}/core/v1/items`, avitoProduct, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      return String(data.id);
    } catch (error) {
      this.logError(error, 'uploadProduct');
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Ошибка выгрузки товара на Avito: ${msg}`);
    }
  }

  async updateProduct(
    marketplaceProductId: string,
    product: Partial<ProductData>,
  ): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      const updateData: Record<string, unknown> = {};

      if (product.price !== undefined) updateData.price = product.price;
      if (product.name !== undefined) updateData.title = product.name;
      if (product.description !== undefined) updateData.description = product.description;
      if (product.images?.length) {
        updateData.images = product.images.map((img) => ({ url: img }));
      }

      await firstValueFrom(
        this.httpService.patch(
          `${this.API_BASE}/core/v1/items/${marketplaceProductId}`,
          updateData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return true;
    } catch (error) {
      this.logError(error, 'updateProduct');
      return false;
    }
  }

  async deleteProduct(marketplaceProductId: string): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      await firstValueFrom(
        this.httpService.delete(`${this.API_BASE}/core/v1/items/${marketplaceProductId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      return true;
    } catch (error) {
      this.logError(error, 'deleteProduct');
      return false;
    }
  }

  async getOrders(since?: Date): Promise<OrderData[]> {
    try {
      const token = await this.getAccessToken();
      const dateFrom = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const { data } = await firstValueFrom(
        this.httpService.get(`${this.API_BASE}/messenger/v3/accounts/me/chats`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            created_at_from: Math.floor(dateFrom.getTime() / 1000),
            limit: 100,
          },
        }),
      );

      if (!data?.result) return [];

      return data.result.map(
        (chat: {
          id: string;
          item_id?: number;
          users?: Array<{ role?: string; name?: string }>;
          last_message_at?: number;
        }) => ({
          id: chat.id,
          marketplaceOrderId: chat.id,
          productId: chat.item_id?.toString() ?? '',
          customerName: chat.users?.find((u) => u.role === 'client')?.name ?? 'Аноним',
          status: 'NEW',
          amount: 0,
          createdAt: new Date((chat.last_message_at ?? 0) * 1000),
        }),
      );
    } catch (error) {
      this.logError(error, 'getOrders');
      return [];
    }
  }

  async updateOrderStatus(
    _marketplaceOrderId: string,
    _status: string,
    _options?: {
      wbStickerNumber?: string;
      wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
      wbSupplyId?: string;
    },
  ): Promise<boolean> {
    return true;
  }

  async syncProducts(products: ProductData[]): Promise<SyncResult> {
    const result: SyncResult = { success: true, syncedCount: 0, failedCount: 0, errors: [], createdMappings: [] };
    for (const product of products) {
      try {
        if (product.avitoProductId) {
          const ok = await this.updateProduct(product.avitoProductId, {
            price: product.price,
            name: product.name,
            description: product.description,
            images: product.images,
          });
          if (ok) result.syncedCount++;
          else {
            result.failedCount++;
            result.errors?.push(`Товар ${product.name}: ошибка обновления на Avito`);
          }
        } else {
          const extId = await this.uploadProduct(product);
          result.syncedCount++;
          result.createdMappings?.push({ productId: product.id, externalSystemId: extId });
        }
      } catch (error) {
        result.failedCount++;
        result.errors?.push(`Товар ${product.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    result.success = result.failedCount === 0;
    return result;
  }

  async getStatistics(): Promise<{
    totalProducts: number;
    totalOrders: number;
    revenue: number;
    lastSyncAt: Date;
  }> {
    try {
      const token = await this.getAccessToken();

      const { data: itemsData } = await firstValueFrom(
        this.httpService.get(`${this.API_BASE}/core/v1/items`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 100 },
        }),
      );

      const activeItems = itemsData?.items?.filter((i: { status?: string }) => i.status === 'active') ?? [];

      const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const { data: chatsData } = await firstValueFrom(
        this.httpService.get(`${this.API_BASE}/messenger/v3/accounts/me/chats`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            created_at_from: Math.floor(dateFrom.getTime() / 1000),
            limit: 1000,
          },
        }),
      );

      return {
        totalProducts: activeItems.length,
        totalOrders: chatsData?.result?.length ?? 0,
        revenue: 0,
        lastSyncAt: new Date(),
      };
    } catch (error) {
      this.logError(error, 'getStatistics');
      return { totalProducts: 0, totalOrders: 0, revenue: 0, lastSyncAt: new Date() };
    }
  }

  async getItemStats(itemId: string): Promise<unknown> {
    try {
      const token = await this.getAccessToken();
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.API_BASE}/core/v1/items/${itemId}/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      return data;
    } catch (error) {
      this.logError(error, 'getItemStats');
      return null;
    }
  }
}
