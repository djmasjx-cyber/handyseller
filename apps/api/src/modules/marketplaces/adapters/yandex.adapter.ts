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
export class YandexAdapter extends BaseMarketplaceAdapter {
  private readonly API_BASE = 'https://api.partner.market.yandex.ru';
  private readonly httpService: HttpService;

  constructor(
    crypto: CryptoService,
    httpService: HttpService,
    config: MarketplaceConfig,
  ) {
    super(crypto, {
      ...config,
      baseUrl: config.baseUrl || 'https://partner.market.yandex.ru',
    });
    this.httpService = httpService;
  }

  /**
   * CanonicalProduct → формат Яндекс Маркета (offer).
   * Маппинг: title→name, long_description→description, vendor_code→offer.id/vendorCode, stock_quantity→quantity.
   */
  convertToPlatform(canonical: CanonicalProduct): PlatformProductPayload {
    const offerId = canonical.vendor_code ?? canonical.canonical_sku;
    const w = (canonical.width_mm ?? 100) / 1000;   // mm → m
    const h = (canonical.height_mm ?? 100) / 1000;
    const l = (canonical.length_mm ?? 100) / 1000;
    const weightKg = ((canonical.weight_grams ?? 100) / 1000).toFixed(3); // g → kg
    const productUrl = canonical.product_url ?? `https://handyseller.ru/product/${canonical.canonical_sku}`;
    const offer: Record<string, unknown> = {
      id: offerId,
      name: canonical.title,
      price: { value: canonical.price, currencyId: 'RUR' },
      categoryId: 90483,
      vendor: canonical.brand_name ?? 'Ручная работа',
      vendorCode: canonical.vendor_code ?? canonical.canonical_sku,
      description: canonical.long_description_html?.trim() || (canonical.long_description_plain ?? canonical.short_description ?? ''),
      sales_notes: 'Ручная работа. Сделано в России.',
      pictures: canonical.images?.map((i) => ({ url: i.url })) ?? [],
      weightDimensions: { height: String(h), length: String(l), width: String(w), weight: weightKg },
      deliveryOptions: { delivery: [{ cost: 300, days: '1-3' }] },
      available: (canonical.stock_quantity ?? 0) > 0,
      quantity: canonical.stock_quantity ?? 0,
      url: productUrl,
    };
    const params: Array<{ name: string; value: string }> = [];
    if (canonical.color?.trim()) params.push({ name: 'Цвет', value: canonical.color.trim() });
    if (canonical.items_per_pack != null && canonical.items_per_pack > 0) params.push({ name: 'Количество предметов в упаковке', value: String(canonical.items_per_pack) });
    if (canonical.material?.trim()) params.push({ name: 'Материал', value: canonical.material.trim() });
    if (canonical.craft_type?.trim()) params.push({ name: 'Вид творчества', value: canonical.craft_type.trim() });
    if (canonical.country_of_origin?.trim()) params.push({ name: 'Страна производства', value: canonical.country_of_origin.trim() });
    if (canonical.package_contents?.trim()) params.push({ name: 'Комплектация', value: canonical.package_contents.trim() });
    if (params.length) offer.param = params;
    return { offer };
  }

  async authenticate(): Promise<boolean> {
    if (!this.config.sellerId) return false;
    try {
      await firstValueFrom(
        this.httpService.get(
          `${this.API_BASE}/campaigns/${this.config.sellerId}/stats/orders.json`,
          {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            params: {
              dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              dateTo: new Date().toISOString().split('T')[0],
            },
          },
        ),
      );
      return true;
    } catch (error) {
      this.logError(error, 'authenticate');
      return false;
    }
  }

  async uploadProduct(product: ProductData): Promise<string> {
    if (!this.config.sellerId) throw new Error('sellerId (campaign ID) не указан');
    try {
      const w = (product.width ?? 100) / 1000;
      const h = (product.height ?? 100) / 1000;
      const l = (product.length ?? 100) / 1000;
      const weightKg = ((product.weight ?? 100) / 1000).toFixed(3);
      const productUrl = product.productUrl ?? `https://handyseller.ru/product/${product.id}`;

      const offerId = product.vendorCode ?? product.id;
      const offer: Record<string, unknown> = {
        id: offerId,
        name: product.name,
        price: { value: product.price, currencyId: 'RUR' },
        categoryId: 90483,
        vendor: product.brand ?? 'Ручная работа',
        vendorCode: product.vendorCode ?? product.id,
        description: (product.richContent?.trim() ? `${product.description || ''}\n\n${product.richContent}`.trim() : product.description) || '',
        sales_notes: 'Ручная работа. Сделано в России.',
        pictures: product.images.map((img) => ({ url: img })),
        weightDimensions: { height: String(h), length: String(l), width: String(w), weight: weightKg },
        deliveryOptions: {
          delivery: [{ cost: 300, days: '1-3' }],
        },
        available: product.stock > 0,
        quantity: product.stock,
        url: productUrl,
      };
      const params: Array<{ name: string; value: string }> = [];
      if (product.color?.trim()) params.push({ name: 'Цвет', value: product.color.trim() });
      if (product.itemsPerPack != null && product.itemsPerPack > 0) params.push({ name: 'Количество предметов в упаковке', value: String(product.itemsPerPack) });
      if (product.material?.trim()) params.push({ name: 'Материал', value: product.material.trim() });
      if (product.craftType?.trim()) params.push({ name: 'Вид творчества', value: product.craftType.trim() });
      if (product.countryOfOrigin?.trim()) params.push({ name: 'Страна производства', value: product.countryOfOrigin.trim() });
      if (product.packageContents?.trim()) params.push({ name: 'Комплектация', value: product.packageContents.trim() });
      if (params.length) offer.param = params;

      await firstValueFrom(
        this.httpService.put(
          `${this.API_BASE}/campaigns/${this.config.sellerId}/offers/${encodeURIComponent(offerId)}.json`,
          { offer },
          {
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return offerId;
    } catch (error) {
      this.logError(error, 'uploadProduct');
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Ошибка выгрузки товара на Яндекс.Маркет: ${msg}`);
    }
  }

  async updateProduct(
    marketplaceProductId: string,
    product: Partial<ProductData>,
  ): Promise<boolean> {
    if (!this.config.sellerId) return false;
    try {
      const updateData: {
        offer: {
          id: string;
          price?: { value: number; currencyId: string };
          available?: boolean;
          quantity?: number;
          name?: string;
          description?: string;
          param?: Array<{ name: string; value: string }>;
        };
      } = { offer: { id: marketplaceProductId } };

      if (product.price !== undefined) {
        updateData.offer.price = { value: product.price, currencyId: 'RUR' };
      }
      if (product.stock !== undefined) {
        updateData.offer.available = product.stock > 0;
        updateData.offer.quantity = product.stock;
      }
      if (product.name !== undefined) updateData.offer.name = product.name;
      if (product.description !== undefined) updateData.offer.description = product.description;
      const hasParamUpdate = ['color', 'itemsPerPack', 'material', 'craftType', 'countryOfOrigin', 'packageContents'].some((k) => (product as Record<string, unknown>)[k] !== undefined);
      if (hasParamUpdate) {
        const params: Array<{ name: string; value: string }> = [];
        if (product.color?.trim()) params.push({ name: 'Цвет', value: product.color.trim() });
        if (product.itemsPerPack != null && product.itemsPerPack > 0) params.push({ name: 'Количество предметов в упаковке', value: String(product.itemsPerPack) });
        if (product.material?.trim()) params.push({ name: 'Материал', value: product.material.trim() });
        if (product.craftType?.trim()) params.push({ name: 'Вид творчества', value: product.craftType.trim() });
        if (product.countryOfOrigin?.trim()) params.push({ name: 'Страна производства', value: product.countryOfOrigin.trim() });
        if (product.packageContents?.trim()) params.push({ name: 'Комплектация', value: product.packageContents.trim() });
        updateData.offer.param = params;
      }

      await firstValueFrom(
        this.httpService.put(
          `${this.API_BASE}/campaigns/${this.config.sellerId}/offers/${marketplaceProductId}.json`,
          updateData,
          {
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
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
    if (!this.config.sellerId) return false;
    try {
      await firstValueFrom(
        this.httpService.put(
          `${this.API_BASE}/campaigns/${this.config.sellerId}/offers/${marketplaceProductId}.json`,
          {
            offer: {
              id: marketplaceProductId,
              available: false,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return true;
    } catch (error) {
      this.logError(error, 'deleteProduct');
      return false;
    }
  }

  async getOrders(since?: Date): Promise<OrderData[]> {
    if (!this.config.sellerId) return [];
    try {
      const dateFrom = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const { data } = await firstValueFrom(
        this.httpService.get(
          `${this.API_BASE}/campaigns/${this.config.sellerId}/orders.json`,
          {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            params: {
              status: 'PROCESSING,DELIVERY,DELIVERED',
              fromDate: dateFrom.toISOString(),
              pageSize: 100,
            },
          },
        ),
      );

      if (!data?.orders) return [];

      return data.orders.map(
        (order: {
          id: number;
          items?: Array<{ offerId?: string }>;
          delivery?: { recipient?: { firstName?: string; phone?: string }; address?: { street?: string; house?: string } };
          buyer?: { email?: string };
          payment?: { transactions?: Array<{ price?: number }> };
          creationDate: string;
          status: string;
        }) => ({
          id: String(order.id),
          marketplaceOrderId: String(order.id),
          productId: order.items?.[0]?.offerId ?? '',
          customerName: order.delivery?.recipient?.firstName ?? 'Аноним',
          customerPhone: order.delivery?.recipient?.phone,
          customerEmail: order.buyer?.email,
          deliveryAddress: order.delivery?.address?.street
            ? `${order.delivery.address.street}, ${order.delivery.address.house ?? ''}`
            : '',
          status: this.mapYandexStatus(order.status),
          amount: order.payment?.transactions?.[0]?.price ?? 0,
          createdAt: new Date(order.creationDate),
        }),
      );
    } catch (error) {
      this.logError(error, 'getOrders');
      return [];
    }
  }

  private mapYandexStatus(yandexStatus: string): string {
    const statusMap: Record<string, string> = {
      OPEN: 'NEW',
      PROCESSING: 'IN_PROGRESS',
      DELIVERY: 'SHIPPED',
      DELIVERED: 'DELIVERED',
      CANCELLED: 'CANCELLED',
      UNPAID: 'NEW',
      RETURNED: 'CANCELLED',
    };
    return statusMap[yandexStatus] ?? 'NEW';
  }

  async updateOrderStatus(
    marketplaceOrderId: string,
    status: string,
    _options?: {
      wbStickerNumber?: string;
      wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
      wbSupplyId?: string;
    },
  ): Promise<boolean> {
    if (!this.config.sellerId) return false;
    const yandexStatus = this.mapStatusToYandex(status);
    if (!yandexStatus) return false;
    try {
      await firstValueFrom(
        this.httpService.put(
          `${this.API_BASE}/campaigns/${this.config.sellerId}/orders/${marketplaceOrderId}/status.json`,
          { status: yandexStatus },
          {
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return true;
    } catch (error) {
      this.logError(error, 'updateOrderStatus');
      return false;
    }
  }

  private mapStatusToYandex(status: string): string | null {
    const statusMap: Record<string, string> = {
      PROCESSING: 'PROCESSING',
      IN_PROGRESS: 'PROCESSING',
      SHIPPED: 'DELIVERY',
      DELIVERED: 'DELIVERED',
      CANCELLED: 'CANCELLED',
    };
    return statusMap[status] ?? null;
  }

  async syncProducts(products: ProductData[]): Promise<SyncResult> {
    const result: SyncResult = { success: true, syncedCount: 0, failedCount: 0, errors: [], createdMappings: [] };
    for (const product of products) {
      try {
        if (product.yandexProductId) {
          const ok = await this.updateProduct(product.yandexProductId, {
            price: product.price,
            stock: product.stock,
            name: product.name,
            description: product.description,
            color: product.color,
            itemsPerPack: product.itemsPerPack,
            material: product.material,
            craftType: product.craftType,
            countryOfOrigin: product.countryOfOrigin,
            packageContents: product.packageContents,
          });
          if (ok) result.syncedCount++;
          else {
            result.failedCount++;
            result.errors?.push(`Товар ${product.name}: ошибка обновления на Яндекс`);
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
    if (!this.config.sellerId) {
      return { totalProducts: 0, totalOrders: 0, revenue: 0, lastSyncAt: new Date() };
    }
    try {
      // Календарный месяц: с 1-го числа текущего месяца
      const dateFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const dateFromStr = dateFrom.toISOString().split('T')[0];
      const dateToStr = new Date().toISOString().split('T')[0];

      const { data: ordersStats } = await firstValueFrom(
        this.httpService.get(
          `${this.API_BASE}/campaigns/${this.config.sellerId}/stats/orders.json`,
          {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            params: { dateFrom: dateFromStr, dateTo: dateToStr },
          },
        ),
      );

      const { data: offersData } = await firstValueFrom(
        this.httpService.get(
          `${this.API_BASE}/campaigns/${this.config.sellerId}/offers.json`,
          {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            params: { limit: 1000 },
          },
        ),
      );

      const orders = ordersStats?.orders ?? [];
      const revenue = orders.reduce(
        (sum: number, order: { payment?: { transactions?: Array<{ price?: number }> } }) =>
          sum + (order.payment?.transactions?.[0]?.price ?? 0),
        0,
      );

      return {
        totalProducts: offersData?.paging?.total ?? 0,
        totalOrders: orders.length,
        revenue,
        lastSyncAt: new Date(),
      };
    } catch (error) {
      this.logError(error, 'getStatistics');
      return { totalProducts: 0, totalOrders: 0, revenue: 0, lastSyncAt: new Date() };
    }
  }
}
