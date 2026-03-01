import { Injectable } from '@nestjs/common';
import { CryptoService } from '../../../common/crypto/crypto.service';
import type { CanonicalProduct } from '../canonical/canonical-product.types';

/** Результат преобразования canonical → формат платформы (зависит от маркетплейса) */
export type PlatformProductPayload = Record<string, unknown>;

/**
 * Контракт синхронизации товаров на основе канонической модели.
 * Каждый адаптер маркетплейса реализует convertToPlatform.
 */
export interface ProductSynchronizerInterface {
  convertToPlatform(canonical: CanonicalProduct): PlatformProductPayload | Promise<PlatformProductPayload>;
}

export interface ProductData {
  id: string;
  name: string;
  description?: string;
  price?: number;
  stock: number;
  images: string[];
  /** Ozon: штрих-код (обязателен для v3 import) */
  barcode?: string;
  /** Артикул продавца (offer_id для Ozon) */
  vendorCode?: string;
  /** Бренд (обяз. WB, vendor на Яндексе) */
  brand?: string;
  /** Вес в граммах */
  weight?: number;
  /** Габариты в мм */
  width?: number;
  length?: number;
  height?: number;
  /** URL страницы товара (обяз. Яндекс) */
  productUrl?: string;
  /** Цвет (WB: characteristics, Ozon: attributes, Яндекс: param) */
  color?: string;
  /** Количество предметов в упаковке */
  itemsPerPack?: number;
  /** Материал изделия */
  material?: string;
  /** Вид творчества */
  craftType?: string;
  /** Страна производства */
  countryOfOrigin?: string;
  /** Комплектация */
  packageContents?: string;
  /** Рич-контент (HTML): WB/Ozon/Яндекс */
  richContent?: string;
  categoryId?: string;
  characteristics?: Record<string, unknown>;
  /** Ozon: description_category_id — для выбора категории при выгрузке */
  ozonCategoryId?: number;
  /** Ozon: type_id — тип товара в категории */
  ozonTypeId?: number;
  /** WB: sku вида WB-xxx-nmId (legacy). Связка через wbNmId. */
  sku?: string;
  /** WB: nm_id из ProductMarketplaceMapping. Приоритет над sku. */
  wbNmId?: number;
  /** Ozon: product_id из ProductMarketplaceMapping — для обновления при повторной выгрузке */
  ozonProductId?: string;
  /** Ozon: штрих-код OZ-формата (из предыдущей выгрузки). При отсутствии — Ozon сгенерирует после создания. */
  barcodeOzon?: string;
  /** Yandex: sku из ProductMarketplaceMapping */
  yandexProductId?: string;
  /** Avito: external id из ProductMarketplaceMapping */
  avitoProductId?: string;
}

export interface OrderData {
  id: string;
  marketplaceOrderId: string;
  productId: string; // ID товара на маркетплейсе (nmId для WB)
  quantity?: number; // по умолчанию 1
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
  /** WB supplierStatus: confirm, complete (FBS), deliver (DBS) */
  rawSupplierStatus?: string;
  processingTimeMin?: number;
  /** WB: тип фулфилмента заказа (FBS/DBS/DBW). Для других маркетплейсов не используется. */
  wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
  /** FBO (Fulfillment by Operator): товар со склада маркетплейса — не списывать остаток «Мой склад». WB: DBW. Ozon: из fbo/list. */
  isFbo?: boolean;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors?: string[];
  /** Созданные связки: productId (наш) → externalSystemId (ID на маркетплейсе). externalArticle — артикул/offer_id для Ozon. */
  createdMappings?: Array<{ productId: string; externalSystemId: string; externalArticle?: string }>;
}

export interface MarketplaceConfig {
  apiKey: string;
  sellerId?: string;
  baseUrl: string;
  warehouseId?: string;
  /** WB: токен «Статистика и Аналитика» для заказов ФБО (со склада WB) */
  statsToken?: string;
}

@Injectable()
export abstract class BaseMarketplaceAdapter implements ProductSynchronizerInterface {
  protected config: MarketplaceConfig;

  constructor(
    protected readonly crypto: CryptoService,
    marketplaceConfig: MarketplaceConfig,
  ) {
    this.config = marketplaceConfig;
  }

  /**
   * Преобразование канонической модели в формат платформы.
   * Реализует паттерн Canonical Model: CanonicalProduct → platform-specific payload.
   */
  abstract convertToPlatform(canonical: CanonicalProduct): PlatformProductPayload | Promise<PlatformProductPayload>;

  /**
   * Аутентификация и проверка подключения
   */
  abstract authenticate(): Promise<boolean>;

  /**
   * Выгрузка товара на маркетплейс
   */
  abstract uploadProduct(product: ProductData): Promise<string>; // Возвращает ID на маркетплейсе

  /**
   * Обновление товара на маркетплейсе
   */
  abstract updateProduct(
    marketplaceProductId: string,
    product: Partial<ProductData>,
  ): Promise<boolean>;

  /**
   * Удаление товара с маркетплейса
   */
  abstract deleteProduct(marketplaceProductId: string): Promise<boolean>;

  /**
   * Получение списка заказов
   */
  abstract getOrders(since?: Date): Promise<OrderData[]>;

  /**
   * Обновление статуса заказа на маркетплейсе.
   * @param options.wbStickerNumber — для WB: числовой id заказа (для supplies API)
   */
  abstract updateOrderStatus(
    marketplaceOrderId: string,
    status: string,
    options?: {
      wbStickerNumber?: string;
      wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
      wbSupplyId?: string;
    },
  ): Promise<boolean>;

  /**
   * Синхронизация всех товаров
   */
  abstract syncProducts(products: ProductData[]): Promise<SyncResult>;

  /**
   * Получение статистики
   */
  abstract getStatistics(): Promise<{
    totalProducts: number;
    totalOrders: number;
    revenue: number;
    lastSyncAt: Date;
  }>;

  /**
   * Вспомогательный метод для расшифровки API ключа
   */
  protected decryptApiKey(encryptedKey: string): string {
    return this.crypto.decrypt(encryptedKey);
  }

  /**
   * Логирование ошибок
   */
  protected logError(error: unknown, context: string): void {
    console.error(`[${this.constructor.name}] ${context}:`, error);
  }
}
