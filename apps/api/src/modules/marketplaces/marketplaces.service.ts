import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';

function mapWbStatusToOurs(s: string): string {
  const key = (s || '').toLowerCase().replace(/\s/g, '');
  const m: Record<string, string> = {
    new: 'NEW',
    confirm: 'IN_PROGRESS',
    confirmed: 'IN_PROGRESS',
    complete: 'SHIPPED',
    deliver: 'SHIPPED',
    sorted: 'SHIPPED',
    shipped: 'SHIPPED',
    ready_for_pickup: 'READY_FOR_PICKUP',
    waiting: 'IN_PROGRESS',
    delivered: 'DELIVERED',
    sold: 'DELIVERED',
    receive: 'DELIVERED',
    cancel: 'CANCELLED',
    canceled: 'CANCELLED',
    cancelled: 'CANCELLED',
    canceled_by_client: 'CANCELLED',
    declined_by_client: 'CANCELLED',
    reject: 'CANCELLED',
    rejected: 'CANCELLED',
    defect: 'CANCELLED',
  };
  return m[key] ?? 'NEW';
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < RETRY_ATTEMPTS; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < RETRY_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
      }
    }
  }
  throw lastError;
}
import { PrismaService } from '../../common/database/prisma.service';
import { Prisma, type MarketplaceConnection } from '@prisma/client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { ProductsService } from '../products/products.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
  MarketplaceAdapterFactory,
  ConnectionConfig,
} from './adapters/marketplace-adapter.factory';
import type { ProductData, OrderData } from './adapters/base-marketplace.adapter';
import { productToCanonical, canonicalToProductData } from './canonical';
import { WildberriesAdapter } from './adapters/wildberries.adapter';
import { OzonAdapter, type OzonCategoryNode, type OzonAttributeInfo } from './adapters/ozon.adapter';
import { ProductMappingService } from './product-mapping.service';
import { WbSupplyService } from './wb-supply.service';
import { classifyMarketplaceTokenExpiry } from './marketplace-token-expiry.util';

@Injectable()
export class MarketplacesService {
  private readonly logger = new Logger(MarketplacesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly adapterFactory: MarketplaceAdapterFactory,
    private readonly productsService: ProductsService,
    private readonly productMappingService: ProductMappingService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly wbSupplyService: WbSupplyService,
  ) {}

  /** userId + linkedToUserId (если привязан) — для доступа к маркетплейсам с другого аккаунта */
  private async getEffectiveUserIds(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { linkedToUserId: true },
    });
    const ids = [userId];
    if (user?.linkedToUserId && user.linkedToUserId !== userId) {
      ids.push(user.linkedToUserId);
    }
    return ids;
  }

  /** Найти подключение маркетплейса — своё или с привязанного аккаунта */
  private async getMarketplaceConnection(
    userId: string,
    marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
  ) {
    const ids = await this.getEffectiveUserIds(userId);
    for (const uid of ids) {
      const conn = await this.prisma.marketplaceConnection.findFirst({
        where: { userId: uid, marketplace },
      });
      if (conn) return conn;
    }
    return null;
  }

  /** Ответ API без секретов + вычисляемый срок токена (для UI). */
  toPublicMarketplaceSnapshot(conn: MarketplaceConnection) {
    return {
      id: conn.id,
      userId: conn.userId,
      marketplace: conn.marketplace,
      sellerId: conn.sellerId,
      warehouseId: conn.warehouseId,
      expiresAt: conn.expiresAt,
      lastSyncAt: conn.lastSyncAt,
      lastError: conn.lastError,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
      hasStatsToken: !!conn.statsToken,
      tokenExpiry: classifyMarketplaceTokenExpiry(conn.expiresAt),
    };
  }

  async findAll(userId: string) {
    const ids = await this.getEffectiveUserIds(userId);
    const list = await this.prisma.marketplaceConnection.findMany({
      where: { userId: { in: ids } },
    });
    const byMarketplace = new Map<string, (typeof list)[0]>();
    for (const uid of ids) {
      for (const c of list) {
        if (c.userId === uid && !byMarketplace.has(c.marketplace)) {
          byMarketplace.set(c.marketplace, c);
        }
      }
    }
    const merged = Array.from(byMarketplace.values());
    return merged.map((conn) => this.toPublicMarketplaceSnapshot(conn));
  }

  async connect(
    userId: string,
    marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
    token: string,
    refreshToken?: string,
    sellerId?: string,
    warehouseId?: string,
    statsToken?: string,
  ) {
    const tok = typeof token === 'string' ? token.trim() : '';
    const sid = typeof sellerId === 'string' ? sellerId.trim() : undefined;

    if (marketplace === 'OZON' && (!sid || !sid.length)) {
      throw new BadRequestException(
        'Для Ozon укажите Client ID (числовой идентификатор из кабинета продавца: Настройки → API-ключи).',
      );
    }
    try {
      const adapter = this.adapterFactory.createAdapter(marketplace, {
        encryptedToken: this.crypto.encrypt(tok),
        encryptedRefreshToken: refreshToken ? this.crypto.encrypt(refreshToken.trim()) : null,
        sellerId: sid,
        warehouseId: typeof warehouseId === 'string' ? warehouseId.trim() : warehouseId,
      });
      if (adapter) {
        const isAuthenticated = await adapter.authenticate();
        if (!isAuthenticated) {
          throw new BadRequestException('Неверный API ключ или данные подключения. Проверьте токен и sellerId.');
        }
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('Ozon:')) {
        throw new BadRequestException(msg.replace(/^Ozon:\s*/, ''));
      }
      throw new InternalServerErrorException(`Ошибка проверки подключения: ${msg}`);
    }

    const encryptedToken = this.crypto.encrypt(tok);
    const encryptedRefresh = refreshToken ? this.crypto.encrypt(refreshToken.trim()) : null;
    const encryptedStats = statsToken ? this.crypto.encrypt(statsToken) : null;

    const existing = await this.prisma.marketplaceConnection.findFirst({
      where: { userId, marketplace },
    });

    if (!existing) {
      const [limits, connCount] = await Promise.all([
        this.subscriptionsService.getLimits(userId),
        this.prisma.marketplaceConnection.count({ where: { userId } }),
      ]);
      if (connCount >= limits.maxMarketplaces) {
        throw new BadRequestException(
          `Достигнут лимит маркетплейсов (${limits.maxMarketplaces}) по вашему тарифу. Перейдите на другой план в разделе «Подписка».`,
        );
      }
    }

    const data: {
      token: string;
      refreshToken: string | null;
      statsToken?: string | null;
      sellerId: string | null;
      warehouseId: string | null;
      lastError: string | null;
    } = {
      token: encryptedToken,
      refreshToken: encryptedRefresh,
      sellerId: sid || null,
      warehouseId: warehouseId || null,
      lastError: null,
    };
    if (statsToken !== undefined) data.statsToken = encryptedStats;

    const conn = existing
      ? await this.prisma.marketplaceConnection.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.marketplaceConnection.create({
          data: { userId, marketplace, ...data },
        });

    return conn;
  }

  async disconnect(userId: string, marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO') {
    await this.prisma.marketplaceConnection.deleteMany({
      where: { userId, marketplace },
    });
  }

  /** Обновить warehouseId для Ozon или WB (без переподключения) */
  async updateWarehouse(
    userId: string,
    marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
    warehouseId: string | null,
  ) {
    const conn = await this.getMarketplaceConnection(userId, marketplace);
    if (!conn) {
      throw new BadRequestException(`Сначала подключите ${marketplace}`);
    }
    return this.prisma.marketplaceConnection.update({
      where: { id: conn.id },
      data: { warehouseId: warehouseId?.trim() || null, lastError: null },
    });
  }

  /** Все подключения WB (для админ-обновления statsToken) */
  async findAllWbConnections(): Promise<Array<{ userId: string; statsToken?: string | null }>> {
    return this.prisma.marketplaceConnection.findMany({
      where: { marketplace: 'WILDBERRIES' },
      select: { userId: true, statsToken: true },
    });
  }

  /** Обновить только statsToken для WB (токен «Статистика и Аналитика» для заказов ФБО) */
  async updateStatsToken(
    userId: string,
    marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
    statsToken: string,
  ) {
    if (marketplace !== 'WILDBERRIES') {
      throw new BadRequestException('Дополнительный токен поддерживается только для Wildberries');
    }
    const conn = await this.getMarketplaceConnection(userId, marketplace);
    if (!conn) {
      throw new BadRequestException('Сначала подключите Wildberries');
    }
    const encrypted = this.crypto.encrypt(statsToken);
    const updated = await this.prisma.marketplaceConnection.update({
      where: { id: conn.id },
      data: { statsToken: encrypted, lastError: null },
    });
    this.eventEmitter.emit('marketplace.wbStatsTokenUpdated', { userId });
    return updated;
  }

  async getUserMarketplaces(userId: string) {
    const ids = await this.getEffectiveUserIds(userId);
    const list = await this.prisma.marketplaceConnection.findMany({
      where: { userId: { in: ids } },
      select: {
        id: true,
        userId: true,
        marketplace: true,
        lastSyncAt: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const byMarketplace = new Map<string, (typeof list)[0]>();
    for (const uid of ids) {
      for (const c of list) {
        if (c.userId === uid && !byMarketplace.has(c.marketplace)) {
          byMarketplace.set(c.marketplace, c);
        }
      }
    }
    return Array.from(byMarketplace.values()).map((c) => ({
      id: c.id,
      type: c.marketplace,
      status: 'active',
      lastSyncAt: c.lastSyncAt,
      error: c.lastError,
      createdAt: c.createdAt,
    }));
  }

  /** Остатки FBO (на складах WB) по productId — для страницы товаров */
  async getWbStockFbo(userId: string): Promise<Record<string, number>> {
    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) return {};
    const ids = await this.getEffectiveUserIds(userId);
    const mappings = await this.prisma.productMarketplaceMapping.findMany({
      where: {
        userId: { in: ids },
        marketplace: 'WILDBERRIES',
        isActive: true,
      },
      select: { productId: true, externalSystemId: true },
    });
    const nmIds = mappings
      .map((m) => parseInt(m.externalSystemId, 10))
      .filter((n) => !isNaN(n));
    if (nmIds.length === 0) return {};
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      encryptedStatsToken: conn.statsToken ?? undefined,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) return {};
    const byNmId = await adapter.getStocksFbo(nmIds);
    const result: Record<string, number> = {};
    for (const m of mappings) {
      const nmId = parseInt(m.externalSystemId, 10);
      if (!isNaN(nmId) && byNmId[nmId] != null) {
        result[m.productId] = byNmId[nmId];
      }
    }
    return result;
  }

  /** Остатки FBO (на складах Ozon) по productId — для страницы товаров */
  async getOzonStockFbo(userId: string): Promise<Record<string, number>> {
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) return {};
    const ids = await this.getEffectiveUserIds(userId);
    const mappings = await this.prisma.productMarketplaceMapping.findMany({
      where: {
        userId: { in: ids },
        marketplace: 'OZON',
        isActive: true,
      },
      select: { productId: true, externalSystemId: true, externalArticle: true },
    });
    const productIdSet = new Set<number>();
    const offerIdSet = new Set<string>();
    for (const m of mappings) {
      if (m.externalSystemId && /^\d+$/.test(m.externalSystemId)) {
        productIdSet.add(parseInt(m.externalSystemId, 10));
      } else {
        const offer = (m.externalArticle ?? m.externalSystemId ?? '').trim();
        if (offer && !offer.startsWith('OZON_')) offerIdSet.add(offer);
      }
    }
    const productIds = [...productIdSet];
    const offerIds = [...offerIdSet];
    if (productIds.length === 0 && offerIds.length === 0) return {};
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) return {};
    try {
      const byProductOrOffer = await adapter.getStocksFbo({ productIds, offerIds });
      const result: Record<string, number> = {};
      for (const m of mappings) {
        const stock: number | undefined =
          (m.externalSystemId ? byProductOrOffer[m.externalSystemId] : undefined) ??
          (m.externalArticle ? byProductOrOffer[m.externalArticle] : undefined);
        if (typeof stock === 'number') result[m.productId] = stock;
      }
      return result;
    } catch {
      return {};
    }
  }

  /** Диагностика остатков FBO Ozon: mappings, запрос, сырой ответ API, распарсенный результат */
  async getOzonFboStockDiagnostic(userId: string): Promise<{
    mappings: Array<{ productId: string; externalSystemId: string; externalArticle: string | null }>;
    productIds: number[];
    offerIds: string[];
    warehouseId: string | null;
    diagnostic: { request: object; response: unknown; parsed: Record<string, number> };
    resultByProductId: Record<string, number>;
  }> {
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) {
      return {
        mappings: [],
        productIds: [],
        offerIds: [],
        warehouseId: null,
        diagnostic: { request: {}, response: { error: 'Ozon не подключён' }, parsed: {} },
        resultByProductId: {},
      };
    }
    const ids = await this.getEffectiveUserIds(userId);
    const mappings = await this.prisma.productMarketplaceMapping.findMany({
      where: { userId: { in: ids }, marketplace: 'OZON', isActive: true },
      select: { productId: true, externalSystemId: true, externalArticle: true },
    });
    const productIdSet = new Set<number>();
    const offerIdSet = new Set<string>();
    for (const m of mappings) {
      if (m.externalSystemId && /^\d+$/.test(m.externalSystemId)) {
        productIdSet.add(parseInt(m.externalSystemId, 10));
      } else {
        const offer = (m.externalArticle ?? m.externalSystemId ?? '').trim();
        if (offer && !offer.startsWith('OZON_')) offerIdSet.add(offer);
      }
    }
    const productIds = [...productIdSet];
    const offerIds = [...offerIdSet];
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      return {
        mappings: mappings.map((m) => ({ ...m, externalArticle: m.externalArticle })),
        productIds,
        offerIds,
        warehouseId: conn.warehouseId,
        diagnostic: { request: {}, response: { error: 'Адаптер Ozon не создан' }, parsed: {} },
        resultByProductId: {},
      };
    }
    const diagnostic = await adapter.getStocksFboRaw({ productIds, offerIds });
    const resultByProductId: Record<string, number> = {};
    for (const m of mappings) {
      const stock: number | undefined =
        (m.externalSystemId ? diagnostic.parsed[m.externalSystemId] : undefined) ??
        (m.externalArticle ? diagnostic.parsed[m.externalArticle] : undefined);
      if (typeof stock === 'number') resultByProductId[m.productId] = stock;
    }
    return {
      mappings: mappings.map((m) => ({ ...m, externalArticle: m.externalArticle })),
      productIds,
      offerIds,
      warehouseId: conn.warehouseId,
      diagnostic,
      resultByProductId,
    };
  }

  /**
   * Синхронизация товаров на подключенные маркетплейсы.
   * @param marketplaceFilter — если указан, синхронизировать только на этот маркетплейс (OZON, WILDBERRIES и т.д.)
   */
  async syncProducts(
    userId: string,
    products: ProductData[],
    marketplaceFilter?: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
  ) {
    const ids = await this.getEffectiveUserIds(userId);
    const where: { userId: { in: string[] }; marketplace?: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO' } = { userId: { in: ids } };
    if (marketplaceFilter) {
      where.marketplace = marketplaceFilter;
    }
    const allConnections = await this.prisma.marketplaceConnection.findMany({ where });
    const byMarketplace = new Map<string, (typeof allConnections)[0]>();
    for (const uid of ids) {
      for (const c of allConnections) {
        if (c.userId === uid && !byMarketplace.has(c.marketplace)) {
          byMarketplace.set(c.marketplace, c);
        }
      }
    }
    const connections = Array.from(byMarketplace.values());

    const results: Array<{ marketplace: string } & { success: boolean; syncedCount: number; failedCount: number; errors?: string[] }> = [];

    for (const conn of connections) {
      if (!conn.token) continue;
      if (conn.marketplace === 'MANUAL') continue;

      if (conn.marketplace === 'OZON' && !conn.warehouseId?.trim()) {
        results.push({
          marketplace: 'OZON',
          success: false,
          syncedCount: 0,
          failedCount: products.length,
          errors: ['ID склада Ozon не указан. Укажите склад в Маркетплейсы → Ozon → выберите склад и нажмите «Сохранить».'],
        });
        continue;
      }

      const adapter = this.adapterFactory.createAdapter(conn.marketplace, {
        encryptedToken: conn.token,
        encryptedRefreshToken: conn.refreshToken,
        encryptedStatsToken: conn.statsToken ?? undefined,
        sellerId: conn.sellerId ?? undefined,
        warehouseId: conn.warehouseId ?? undefined,
      });

      if (!adapter) {
        results.push({ marketplace: conn.marketplace, success: false, syncedCount: 0, failedCount: products.length, errors: ['Адаптер не найден'] });
        continue;
      }

      let productsToSync = await this.enrichProductsWithMarketplaceMappings(ids, products, conn.marketplace, userId);

      try {
        const result = await withRetry(
          () => adapter.syncProducts(productsToSync),
          `syncProducts ${conn.marketplace}`,
        );
        results.push({ marketplace: conn.marketplace, ...result });

        if (result.createdMappings?.length) {
          for (const m of result.createdMappings) {
            await this.productMappingService.upsertMapping(
              m.productId,
              userId,
              conn.marketplace as 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
              m.externalSystemId,
              conn.marketplace === 'OZON' && m.externalArticle
                ? { externalArticle: m.externalArticle }
                : undefined,
            );
            // Автосохранение штрих-кода после создания карточки на маркете
            await this.saveBarcodeFromMarketplace(userId, m.productId, conn.marketplace, m.externalSystemId);
          }
        }
        if (conn.marketplace === 'OZON' && result.updatedMappings?.length) {
          for (const m of result.updatedMappings) {
            await this.productMappingService.updateOzonMappingForUserIds(
              m.productId,
              ids,
              m.externalSystemId,
              m.externalArticle,
            );
          }
        }

        await this.prisma.marketplaceConnection.update({
          where: { id: conn.id },
          data: { lastSyncAt: new Date(), lastError: null },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({
          marketplace: conn.marketplace,
          success: false,
          syncedCount: 0,
          failedCount: products.length,
          errors: [msg],
        });
        await this.prisma.marketplaceConnection.update({
          where: { id: conn.id },
          data: { lastError: msg },
        });
      }
    }

    return results;
  }

  /**
   * Загрузить штрих-код с маркета и сохранить в Product после создания карточки.
   * Штрих-код уникален per маркет — вводить вручную нельзя.
   */
  private async saveBarcodeFromMarketplace(
    userId: string,
    productId: string,
    marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
    externalSystemId: string,
  ): Promise<void> {
    const conn = await this.getMarketplaceConnection(userId, marketplace);
    if (!conn?.token) return;
    const adapter = this.adapterFactory.createAdapter(marketplace, {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      encryptedStatsToken: conn.statsToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    try {
      if (marketplace === 'WILDBERRIES' && adapter instanceof WildberriesAdapter) {
        const nmId = parseInt(externalSystemId, 10);
        if (!isNaN(nmId)) {
          const barcode = await adapter.getBarcodeByNmId(nmId);
          if (barcode) {
            await this.prisma.product.update({
              where: { id: productId },
              data: { barcodeWb: barcode },
            });
          }
        }
      } else if (marketplace === 'OZON' && adapter instanceof OzonAdapter) {
        const product = await this.productsService.findById(userId, productId);
        const offerId = product ? (product.article ?? product.sku ?? '').toString().trim() : undefined;
        // Ozon генерирует штрих-код автоматически при импорте. Retry до 6 раз (~21 сек).
        let barcode: string | null = null;
        for (let attempt = 0; attempt < 6; attempt++) {
          barcode = await adapter.getBarcodeByProductId(externalSystemId, offerId || undefined);
          if (barcode) break;
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 5000));
          } else if (attempt < 5) {
            await new Promise((r) => setTimeout(r, 4000));
          }
        }
        if (barcode) {
          await this.prisma.product.update({
            where: { id: productId },
            data: { barcodeOzon: barcode },
          });
        }
      }
    } catch (err) {
      console.warn(`[MarketplacesService] saveBarcodeFromMarketplace ${marketplace}:`, err);
    }
  }

  /** Обогатить products external ID из ProductMarketplaceMapping — для обновления при повторной выгрузке.
   * userIds: текущий userId + linkedToUserId (для привязанных аккаунтов).
   * Для Ozon: включаем все активные связки (не только syncStock: true), чтобы остаток передавался по всем товарам со связкой.
   * userId передаётся в каждый product для re-hosting WB CDN URL → S3. */
  private async enrichProductsWithMarketplaceMappings(
    userIds: string[],
    products: ProductData[],
    marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
    userId: string,
  ): Promise<ProductData[]> {
    const mappings = await this.prisma.productMarketplaceMapping.findMany({
      where: {
        userId: { in: userIds },
        marketplace,
        isActive: true,
        ...(marketplace === 'WILDBERRIES' ? { syncStock: true } : {}),
      },
    });
    const byProduct = new Map(mappings.map((m) => [m.productId, m]));
    return products.map((p) => {
      let m = byProduct.get(p.id);
      if (marketplace === 'OZON') {
        const ozonForProduct = mappings.filter((x) => x.productId === p.id);
        if (ozonForProduct.length > 1) {
          const vendorCode = (p.vendorCode ?? '').toString().trim();
          m = ozonForProduct.find((x) => (x.externalArticle ?? '').trim() === vendorCode) ?? ozonForProduct[0];
        }
      }
      // Добавляем userId для re-hosting WB CDN → S3
      const enriched: ProductData = { ...p, userId };
      if (!m) return enriched;
      const extId = m.externalSystemId;
      if (marketplace === 'WILDBERRIES') {
        const wbNmId = parseInt(extId, 10);
        return !isNaN(wbNmId) ? { ...enriched, wbNmId } : enriched;
      }
      if (marketplace === 'OZON') {
        const ozonEnriched = { ...enriched, ozonProductId: extId };
        ozonEnriched.vendorCode = m.externalArticle?.trim() || ozonEnriched.vendorCode;
        return ozonEnriched;
      }
      if (marketplace === 'YANDEX') return { ...enriched, yandexProductId: extId };
      if (marketplace === 'AVITO') return { ...enriched, avitoProductId: extId };
      return enriched;
    });
  }

  /**
   * Передать статус заказа на маркетплейс (при смене «Новый» → «На сборке» и т.п.).
   * @throws BadRequestException при ошибке push (нет подключения, ошибка API).
   */
  async pushOrderStatus(
    userId: string,
    marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
    payload: {
      marketplaceOrderId: string;
      status: string;
      wbStickerNumber?: string;
      wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
    },
  ): Promise<void> {
    const conn = await this.getMarketplaceConnection(userId, marketplace);
    if (!conn?.token) {
      throw new BadRequestException(
        `Нет подключения к ${marketplace}. Подключите маркетплейс в настройках.`,
      );
    }

    const adapter = this.adapterFactory.createAdapter(marketplace, {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      encryptedStatsToken: conn.statsToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter) {
      throw new BadRequestException(`Адаптер ${marketplace} не найден.`);
    }

    let wbSupplyId: string | undefined;
    if (
      marketplace === 'WILDBERRIES' &&
      payload.wbFulfillmentType === 'FBS' &&
      adapter instanceof WildberriesAdapter
    ) {
      const supply = await this.wbSupplyService.getOrCreateActiveSupply(userId, adapter);
      wbSupplyId = supply.wbSupplyId;
    }

    const ok = await adapter.updateOrderStatus(payload.marketplaceOrderId, payload.status, {
      wbStickerNumber: payload.wbStickerNumber,
      wbFulfillmentType: payload.wbFulfillmentType,
      wbSupplyId,
    });
    if (!ok) {
      throw new BadRequestException(
        `Не удалось передать статус на ${marketplace}. Проверьте логи или обратитесь в поддержку.`,
      );
    }
  }

  /** WB FBS: получить адаптер и активную поставку (создаёт при необходимости). */
  private async getWbAdapterAndSupply(userId: string): Promise<{ adapter: WildberriesAdapter; supplyId: string }> {
    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) {
      throw new BadRequestException('Нет подключения к Wildberries. Подключите маркетплейс в настройках.');
    }
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      encryptedStatsToken: conn.statsToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      throw new BadRequestException('Адаптер Wildberries не найден.');
    }
    const supply = await this.wbSupplyService.getOrCreateActiveSupply(userId, adapter);
    return { adapter, supplyId: supply.wbSupplyId };
  }

  /** WB FBS: информация о поставке и грузоместах. */
  async getWbSupplyInfo(userId: string): Promise<{ supplyId: string; trbxes: Array<{ id: string }> } | null> {
    const { adapter, supplyId } = await this.getWbAdapterAndSupply(userId);
    const trbxes = await adapter.getSupplyTrbx(supplyId);
    return { supplyId, trbxes };
  }

  /** WB FBS: добавить грузоместа (коробки). */
  async addWbTrbx(userId: string, amount: number): Promise<{ trbxIds: string[] }> {
    try {
      const { adapter, supplyId } = await this.getWbAdapterAndSupply(userId);
      const trbxIds = await adapter.addTrbxToSupply(supplyId, Math.min(Math.max(1, amount), 1000));
      return { trbxIds };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(msg);
    }
  }

  /** WB FBS: стикеры грузомест для печати. */
  async getWbTrbxStickers(userId: string, type: 'svg' | 'png' | 'zplv' | 'zplh' = 'png'): Promise<{
    supplyId: string;
    stickers: Array<{ trbxId: string; file: string }>;
  }> {
    const { adapter, supplyId } = await this.getWbAdapterAndSupply(userId);
    const trbxes = await adapter.getSupplyTrbx(supplyId);
    const trbxIds = trbxes.map((t) => t.id);
    if (trbxIds.length === 0) {
      throw new BadRequestException('Нет грузомест. Сначала создайте коробки в поставке.');
    }
    const stickers = await adapter.getTrbxStickers(supplyId, trbxIds, type);
    return { supplyId, stickers };
  }

  /** WB FBS: сдать поставку в доставку. */
  async deliverWbSupply(userId: string): Promise<{ ok: boolean; message?: string }> {
    const { adapter, supplyId } = await this.getWbAdapterAndSupply(userId);
    const ok = await adapter.deliverSupply(supplyId);
    if (ok) {
      await this.prisma.wbSupply.updateMany({
        where: { userId, wbSupplyId: supplyId },
        data: { status: 'DELIVERED', updatedAt: new Date() },
      });
      // Переводим заказы из поставки в статус «Доставляется» — убираем со страницы «На сборке»
      const orderIds = adapter instanceof WildberriesAdapter
        ? await adapter.getSupplyOrderIds(supplyId)
        : [];
      if (orderIds.length > 0) {
        await this.prisma.order.updateMany({
          where: {
            userId,
            marketplace: 'WILDBERRIES',
            status: 'IN_PROGRESS',
            OR: [
              { wbStickerNumber: { in: orderIds } },
              { externalId: { in: orderIds } },
            ],
          },
          data: { status: 'SHIPPED' },
        });
      } else {
        // Fallback: все WB IN_PROGRESS → SHIPPED (типичный случай: одна активная поставка)
        await this.prisma.order.updateMany({
          where: { userId, marketplace: 'WILDBERRIES', status: 'IN_PROGRESS' },
          data: { status: 'SHIPPED' },
        });
      }
      return { ok: true };
    }
    return { ok: false, message: 'Не удалось сдать поставку в доставку' };
  }

  /** WB FBS: QR-код поставки для СЦ (доступен только после deliver). При сдаче на ПВЗ не требуется. */
  async getWbSupplyBarcode(userId: string, type: 'svg' | 'png' | 'zplv' | 'zplh' = 'png'): Promise<{
    barcode: string;
    file: string;
  } | null> {
    const supply = await this.prisma.wbSupply.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!supply) {
      throw new BadRequestException('Нет активной поставки. Сначала добавьте заказы и сдайте в доставку.');
    }
    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) throw new BadRequestException('Нет подключения к Wildberries.');
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      encryptedStatsToken: conn.statsToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      throw new BadRequestException('Адаптер Wildberries не найден.');
    }
    return adapter.getSupplyBarcode(supply.wbSupplyId, type);
  }

  /**
   * Получение заказов со всех маркетплейсов
   */
  async getOrdersFromAllMarketplaces(userId: string, since?: Date): Promise<OrderData[]> {
    const ids = await this.getEffectiveUserIds(userId);
    const connections = await this.prisma.marketplaceConnection.findMany({
      where: { userId: { in: ids } },
    });
    const byMarketplace = new Map<string, (typeof connections)[0]>();
    for (const uid of ids) {
      for (const c of connections) {
        if (c.userId === uid && !byMarketplace.has(c.marketplace)) {
          byMarketplace.set(c.marketplace, c);
        }
      }
    }
    const connections_merged = Array.from(byMarketplace.values());

    const allOrders: OrderData[] = [];

    for (const conn of connections_merged) {
      if (!conn.token) continue;
      if (conn.marketplace === 'MANUAL') continue;

      const adapter = this.adapterFactory.createAdapter(conn.marketplace, {
        encryptedToken: conn.token,
        encryptedStatsToken: conn.statsToken,
        sellerId: conn.sellerId ?? undefined,
        warehouseId: conn.warehouseId ?? undefined,
      });
      if (!adapter) continue;

      try {
        const orders = await withRetry(
          () => adapter.getOrders(since),
          `getOrders ${conn.marketplace}`,
        );
        allOrders.push(...orders.map((o) => ({ ...o, marketplace: conn.marketplace })));
      } catch (error) {
        console.error(`[MarketplacesService] Ошибка получения заказов с ${conn.marketplace} (после ${RETRY_ATTEMPTS} попыток):`, error);
      }
    }

    return allOrders;
  }

  /**
   * Статистика заказов по маркетплейсам — только БД, один оптимизированный запрос.
   * Период: календарный месяц по умолчанию.
   * totalOrders: без отменённых (CANCELLED), чтобы не вносить путаницу.
   */
  async getOrdersStatsByMarketplace(
    userId: string,
    from?: Date,
    to?: Date,
  ): Promise<
    Record<
      string,
      {
        totalOrders: number;
        delivered: number;
        cancelled: number;
        /** Выкуп (сумма DELIVERED). Для обратной совместимости поле остаётся. */
        revenue: number;
        /** Продажи (сумма всех заказов кроме CANCELLED). */
        salesRevenue: number;
      }
    >
  > {
    const ids = await this.getEffectiveUserIds(userId);
    const now = new Date();
    const fromDate = from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Отказы = cancellation_kind=REFUSAL (новая модель).
    // Для legacy-данных без cancellation_kind используем fallback по raw_status.
    const rows = await this.prisma.$queryRaw<
      Array<{
        marketplace: string;
        total_orders: bigint;
        delivered_count: bigint;
        cancelled_count: bigint;
        revenue: string;
        sales_revenue: string;
      }>
    >`
      SELECT 
        marketplace::text,
        COUNT(*) FILTER (WHERE status <> 'CANCELLED')::bigint as total_orders,
        COUNT(*) FILTER (WHERE status = 'DELIVERED')::bigint as delivered_count,
        COUNT(*) FILTER (WHERE status = 'CANCELLED' AND (
          cancellation_kind = 'REFUSAL'
          OR (
            cancellation_kind IS NULL AND (
              raw_status IS NULL
              OR LOWER(TRIM(raw_status)) IN ('canceled_by_client','declined_by_client','reject','rejected','cancelled_by_client','customer_refused')
            )
          )
        ))::bigint as cancelled_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'DELIVERED'), 0)::text as revenue,
        COALESCE(SUM(total_amount) FILTER (WHERE status <> 'CANCELLED'), 0)::text as sales_revenue
      FROM "Order"
      WHERE user_id IN (${Prisma.join(ids)})
        AND created_at >= ${fromDate}
        AND created_at <= ${toDate}
      GROUP BY marketplace
    `;

    const result: Record<
      string,
      { totalOrders: number; delivered: number; cancelled: number; revenue: number; salesRevenue: number }
    > = {};
    for (const r of rows) {
      const key = r.marketplace.toLowerCase();
      result[key] = {
        totalOrders: Number(r.total_orders) || 0,
        delivered: Number(r.delivered_count) || 0,
        cancelled: Number(r.cancelled_count) || 0,
        revenue: Math.round(Number(r.revenue || 0) * 100) / 100,
        salesRevenue: Math.round(Number(r.sales_revenue || 0) * 100) / 100,
      };
    }
    return result;
  }

  /**
   * Статистика заказов по маркетплейсу и статусу — для блока «Озон» / «ВБ» на Главной.
   * Текущий календарный месяц, FBO+FBS.
   * delivered = Получен клиентом, shipped = Доставляется, inProgress = На сборке, cancelled = Отменен.
   */
  async getOrdersStatsByStatus(
    userId: string,
    from?: Date,
    to?: Date,
  ): Promise<
    Record<
      string,
      {
        delivered: { count: number; sum: number };
        shipped: { count: number; sum: number };
        inProgress: { count: number; sum: number };
        cancelled: { count: number; sum: number };
      }
    >
  > {
    const ids = await this.getEffectiveUserIds(userId);
    const now = new Date();
    const fromDate = from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const rows = await this.prisma.$queryRaw<
      Array<{
        marketplace: string;
        status_group: string;
        cnt: bigint;
        sum_amount: string;
      }>
    >`
      SELECT 
        marketplace::text,
        CASE 
          WHEN status = 'DELIVERED' THEN 'delivered'
          WHEN status IN ('SHIPPED', 'READY_FOR_PICKUP') THEN 'shipped'
          WHEN status IN ('NEW', 'IN_PROGRESS') THEN 'inProgress'
          WHEN status = 'CANCELLED' THEN 'cancelled'
          ELSE 'other'
        END as status_group,
        COUNT(*)::bigint as cnt,
        COALESCE(SUM(total_amount), 0)::text as sum_amount
      FROM "Order"
      WHERE user_id IN (${Prisma.join(ids)})
        AND created_at >= ${fromDate}
        AND created_at <= ${toDate}
      GROUP BY marketplace, status_group
    `;

    const empty = () => ({ count: 0, sum: 0 });
    const result: Record<
      string,
      { delivered: { count: number; sum: number }; shipped: { count: number; sum: number }; inProgress: { count: number; sum: number }; cancelled: { count: number; sum: number } }
    > = {};

    const groups = ['delivered', 'shipped', 'inProgress', 'cancelled'] as const;
    for (const r of rows) {
      const key = r.marketplace.toUpperCase();
      if (!result[key]) {
        result[key] = { delivered: empty(), shipped: empty(), inProgress: empty(), cancelled: empty() };
      }
      const group = r.status_group as (typeof groups)[number];
      if (groups.includes(group)) {
        result[key][group] = {
          count: Number(r.cnt) || 0,
          sum: Math.round(Number(r.sum_amount || 0) * 100) / 100,
        };
      }
    }
    return result;
  }

  /**
   * Синхронизация логистики и комиссий по выкупленным заказам из API WB и Ozon.
   * Обновляет Order.logisticsCost, Order.commissionAmount, Order.costsSyncedAt.
   */
  async syncOrderCosts(
    userId: string,
    from?: Date,
    to?: Date,
  ): Promise<{ updated: number; errors: string[] }> {
    const ids = await this.getEffectiveUserIds(userId);
    const now = new Date();
    const fromDate = from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const deliveredOrders = await this.prisma.order.findMany({
      where: {
        userId: { in: ids },
        status: 'DELIVERED',
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: { id: true, externalId: true, ozonPostingNumber: true, marketplace: true },
    });

    if (deliveredOrders.length === 0) {
      return { updated: 0, errors: [] };
    }

    const byMarketplace = new Map<string, typeof deliveredOrders>();
    for (const o of deliveredOrders) {
      const list = byMarketplace.get(o.marketplace) ?? [];
      list.push(o);
      byMarketplace.set(o.marketplace, list);
    }

    const errors: string[] = [];
    let updated = 0;

    for (const [marketplace, orders] of byMarketplace) {
      const conn = await this.getMarketplaceConnection(userId, marketplace as 'WILDBERRIES' | 'OZON');
      if (!conn?.token) continue;

      const adapter = this.adapterFactory.createAdapter(marketplace as 'WILDBERRIES' | 'OZON', {
        encryptedToken: conn.token,
        encryptedRefreshToken: conn.refreshToken ?? undefined,
        encryptedStatsToken: conn.statsToken ?? undefined,
        sellerId: conn.sellerId ?? undefined,
        warehouseId: conn.warehouseId ?? undefined,
      });

      if (!adapter) continue;

      try {
        if (marketplace === 'WILDBERRIES') {
          const wbAdapter = adapter as import('./adapters/wildberries.adapter').WildberriesAdapter;
          if (typeof wbAdapter.getOrderCostsFromReport !== 'function') continue;
          const costsMap = await wbAdapter.getOrderCostsFromReport(fromDate, toDate);
          for (const order of orders) {
            const costs = costsMap.get(order.externalId);
            if (!costs) continue;
            await this.prisma.order.update({
              where: { id: order.id },
              data: {
                logisticsCost: costs.logisticsCost,
                commissionAmount: costs.commissionAmount,
                costsSyncedAt: new Date(),
              },
            });
            updated++;
          }
        } else if (marketplace === 'OZON') {
          const ozonAdapter = adapter as import('./adapters/ozon.adapter').OzonAdapter;
          if (typeof ozonAdapter.getOrderCostsFromFinance !== 'function') continue;
          const costsMap = await ozonAdapter.getOrderCostsFromFinance(fromDate, toDate);
          for (const order of orders) {
            const postingNumber = order.ozonPostingNumber ?? order.externalId;
            const costs = costsMap.get(postingNumber);
            if (!costs) continue;
            await this.prisma.order.update({
              where: { id: order.id },
              data: {
                logisticsCost: costs.logisticsCost,
                commissionAmount: costs.commissionAmount,
                costsSyncedAt: new Date(),
              },
            });
            updated++;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${marketplace}: ${msg}`);
      }
    }

    return { updated, errors };
  }

  /**
   * Подсчёт связанных товаров по маркетплейсам — только из БД, без внешних API.
   * Источники: ProductMarketplaceMapping, legacy Product.sku (WB), Order+OrderItem.
   */
  async getLinkedProductsStats(userId: string): Promise<{
    byMarketplace: Record<string, number>;
    totalUnique: number;
  }> {
    const ids = await this.getEffectiveUserIds(userId);
    const linkedByMp = new Map<string, Set<string>>();
    const allProductIds = new Set<string>();

    // 1. ProductMarketplaceMapping — канонический источник
    // Проверяем что товар не в архиве (через include product)
    const mappings = await this.prisma.productMarketplaceMapping.findMany({
      where: { userId: { in: ids }, isActive: true },
      select: { productId: true, marketplace: true, product: { select: { archivedAt: true } } },
    });
    for (const m of mappings) {
      // Пропускаем архивные товары
      if (m.product?.archivedAt != null) continue;
      const key = m.marketplace.toLowerCase();
      if (!linkedByMp.has(key)) linkedByMp.set(key, new Set());
      linkedByMp.get(key)!.add(m.productId);
      allProductIds.add(m.productId);
    }

    // 2. Legacy Product.sku — WB (WB-*-nmId), OZ (OZ-*), YM (YM-*), AV (AV-*) — как на вкладке Товары
    const legacyProducts = await this.prisma.product.findMany({
      where: {
        userId: { in: ids },
        sku: { not: null },
        archivedAt: null,
      },
      select: { id: true, sku: true, marketplaceMappings: { where: { isActive: true }, select: { marketplace: true } } },
    });
    const wbSkuRegex = /^WB-[^-]+-[0-9]+$/;
    const legacyPatterns: { pattern: RegExp | ((s: string) => boolean); key: string }[] = [
      { pattern: wbSkuRegex, key: 'wildberries' },
      { pattern: (s) => s.startsWith('OZ-'), key: 'ozon' },
      { pattern: (s) => s.startsWith('YM-'), key: 'yandex' },
      { pattern: (s) => s.startsWith('AV-'), key: 'avito' },
    ];
    for (const p of legacyProducts) {
      const sku = p.sku ?? '';
      const hasMapping = (mp: string) => p.marketplaceMappings.some((m) => m.marketplace.toLowerCase() === mp);
      for (const { pattern, key } of legacyPatterns) {
        const matches = typeof pattern === 'function' ? pattern(sku) : pattern.test(sku);
        if (!matches || hasMapping(key)) continue;
        if (!linkedByMp.has(key)) linkedByMp.set(key, new Set());
        linkedByMp.get(key)!.add(p.id);
        allProductIds.add(p.id);
      }
    }

    // 3. Order + OrderItem — товары с заказами (доказано на площадке)
    // Получаем productIds из заказов и фильтруем архивные
    const orderItems = await this.prisma.orderItem.findMany({
      where: { order: { userId: { in: ids } } },
      select: { productId: true, order: { select: { marketplace: true } } },
    });
    const orderProductIds = [...new Set(orderItems.map(i => i.productId).filter(Boolean))];
    const activeOrderProducts = await this.prisma.product.findMany({
      where: { id: { in: orderProductIds }, archivedAt: null },
      select: { id: true },
    });
    const activeOrderProductIds = new Set(activeOrderProducts.map(p => p.id));
    for (const item of orderItems) {
      if (!item.productId || !item.order?.marketplace) continue;
      // Пропускаем архивные товары
      if (!activeOrderProductIds.has(item.productId)) continue;
      const key = item.order.marketplace.toLowerCase();
      if (!linkedByMp.has(key)) linkedByMp.set(key, new Set());
      linkedByMp.get(key)!.add(item.productId);
      allProductIds.add(item.productId);
    }

    const byMarketplace: Record<string, number> = {};
    for (const [key, set] of linkedByMp) {
      byMarketplace[key] = set.size;
    }
    return { byMarketplace, totalUnique: allProductIds.size };
  }

  /**
   * Получение статистики по всем маркетплейсам.
   * totalProducts — из адаптера (карточек на площадке); linkedProductsCount — число наших товаров (по productId), связанных с площадкой.
   */
  async getStatistics(
    userId: string,
  ): Promise<{
    statistics: Record<
      string,
      { totalProducts: number; totalOrders: number; revenue: number; lastSyncAt: Date; linkedProductsCount: number }
    >;
    totalUniqueLinkedProducts: number;
  }> {
    const ids = await this.getEffectiveUserIds(userId);
    const allConns = await this.prisma.marketplaceConnection.findMany({
      where: { userId: { in: ids } },
    });
    const byMarketplace = new Map<string, (typeof allConns)[0]>();
    for (const uid of ids) {
      for (const c of allConns) {
        if (c.userId === uid && !byMarketplace.has(c.marketplace)) {
          byMarketplace.set(c.marketplace, c);
        }
      }
    }
    const connections = Array.from(byMarketplace.values());

    const [mappings, ...adapterStats] = await Promise.all([
      this.prisma.productMarketplaceMapping.findMany({
        where: { userId: { in: ids }, isActive: true },
        select: { productId: true, marketplace: true },
      }),
      ...connections
        .filter((conn) => conn.token && conn.marketplace !== 'MANUAL')
        .map(async (conn) => {
          const adapter = this.adapterFactory.createAdapter(conn.marketplace, {
            encryptedToken: conn.token!,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
          });
          if (!adapter) return null;
          try {
            const stats = await adapter.getStatistics();
            return { marketplace: conn.marketplace.toLowerCase(), stats } as const;
          } catch (error) {
            console.error(`[MarketplacesService] Ошибка получения статистики с ${conn.marketplace}:`, error);
            return null;
          }
        }),
    ]);

    const linkedByMp = new Map<string, Set<string>>();
    const allProductIds = new Set<string>();
    for (const m of mappings) {
      const key = m.marketplace.toLowerCase();
      if (!linkedByMp.has(key)) linkedByMp.set(key, new Set());
      linkedByMp.get(key)!.add(m.productId);
      allProductIds.add(m.productId);
    }

    const statistics: Record<
      string,
      { totalProducts: number; totalOrders: number; revenue: number; lastSyncAt: Date; linkedProductsCount: number }
    > = {};
    for (const result of adapterStats) {
      if (!result) continue;
      const { marketplace, stats } = result;
      statistics[marketplace] = {
        ...stats,
        linkedProductsCount: linkedByMp.get(marketplace)?.size ?? 0,
      };
    }
    for (const conn of connections) {
      const key = conn.marketplace.toLowerCase();
      if (statistics[key]) continue;
      statistics[key] = {
        totalProducts: 0,
        totalOrders: 0,
        revenue: 0,
        lastSyncAt: new Date(),
        linkedProductsCount: linkedByMp.get(key)?.size ?? 0,
      };
    }

    return {
      statistics,
      totalUniqueLinkedProducts: allProductIds.size,
    };
  }

  /**
   * Получить остаток товара на WB по displayId.
   * Связка через ProductMarketplaceMapping (nm_id) или legacy sku.
   */
  async getWbStockForProduct(
    userId: string,
    displayId: string,
  ): Promise<{
    displayId: string;
    article?: string;
    nmId?: number;
    localStock: number;
    wbStock?: number;
    chrtIdsCount?: number;
    hint?: string;
    error?: string;
  }> {
    const product = await this.productsService.findByArticleOrId(userId, displayId);
    if (!product) {
      throw new BadRequestException('Товар не найден');
    }
    let nmId: number | null = await this.productMappingService.getWbNmId(product.id, userId);
    if (nmId == null) {
      const match = (product.sku ?? '').match(/^WB-[^-]+-(\d+)$/);
      nmId = match ? parseInt(match[1], 10) : null;
    }
    if (nmId == null) {
      return {
        displayId: String(product.displayId).padStart(4, '0'),
        localStock: product.stock,
        error: 'Товар не привязан к WB (нет маппинга nm_id)',
      };
    }

    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) {
      throw new BadRequestException('Wildberries не подключён');
    }

    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      throw new BadRequestException('Ошибка доступа к WB');
    }

    const stocks = await adapter.getStocks([nmId]);
    const wbStock = stocks[nmId] ?? 0;

    const chrtIds = await adapter.getChrtIdsForNmId(nmId);
    const hint =
      chrtIds.length <= 1 && product.stock !== wbStock
        ? 'Найдён 1 размер. Если на WB несколько размеров — обновляется только первый, остальные сохраняют старые значения. Синхронизируйте повторно.'
        : undefined;

    return {
      displayId: String(product.displayId).padStart(4, '0'),
      article: product.article ?? undefined,
      nmId,
      localStock: product.stock,
      wbStock,
      chrtIdsCount: chrtIds.length,
      hint,
    };
  }

  /** Принудительно отправить остаток на WB (при расхождении) */
  async forceSyncWbStock(
    userId: string,
    displayIdOrArticle: string,
  ): Promise<{ ok: boolean; message: string; wbStock?: number }> {
    const product = await this.productsService.findByArticleOrId(userId, displayIdOrArticle);
    if (!product) throw new BadRequestException('Товар не найден');
    let nmId: number | null = await this.productMappingService.getWbNmId(product.id, userId);
    if (nmId == null) {
      const match = (product.sku ?? '').match(/^WB-[^-]+-(\d+)$/);
      nmId = match ? parseInt(match[1], 10) : null;
    }
    if (nmId == null) {
      return { ok: false, message: 'Товар не привязан к WB' };
    }
    const results = await this.syncProducts(userId, [
      {
        id: product.id,
        name: product.title,
        stock: product.stock,
        images: product.imageUrl ? [product.imageUrl] : [],
        wbNmId: nmId,
        vendorCode: (product.article ?? product.sku ?? '').toString().trim() || undefined,
      },
    ], 'WILDBERRIES');
    const r = results[0];
    const wb = await this.getWbStockForProduct(userId, displayIdOrArticle);
    return {
      ok: r?.success ?? false,
      message: r?.success ? `Остаток ${product.stock} отправлен на WB` : (r?.errors?.[0] ?? 'Ошибка синхронизации'),
      wbStock: wb.wbStock,
    };
  }

  /** Получить штрих-код WB по productId — для автозаполнения в карточке товара.
   * Если маппинг не найден — ищет карточку на WB по vendorCode и создаёт маппинг.
   */
  async getWbBarcodeForProduct(userId: string, productId: string): Promise<{ barcode: string } | { error: string }> {
    const product = await this.productsService.findById(userId, productId);
    if (!product) {
      throw new BadRequestException('Товар не найден');
    }
    let nmId: number | null = await this.productMappingService.getWbNmId(product.id, userId);
    if (nmId == null) {
      const match = (product.sku ?? '').match(/^WB-[^-]+-(d+)$/);
      nmId = match ? parseInt(match[1], 10) : null;
    }
  
    // Если маппинг не найден — ищем карточку на WB по vendorCode (article)
    if (nmId == null) {
      const vendorCode = (product.article ?? product.sku ?? '').toString().trim();
      if (vendorCode) {
        const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
        if (conn?.token) {
          const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
          });
          if (adapter instanceof WildberriesAdapter) {
            const foundNmId = await adapter.findNmIdByVendorCode(vendorCode);
            if (foundNmId) {
              nmId = foundNmId;
              // Сохраняем маппинг для будущих запросов
              await this.productMappingService.upsertMapping(
                product.id,
                userId,
                'WILDBERRIES',
                String(foundNmId),
                { externalArticle: vendorCode },
              );
              console.log(`[MarketplacesService] Создан маппинг WB: productId=${product.id}, nmId=${foundNmId}, vendorCode=${vendorCode}`);
            }
          }
        }
      }
    }
  
    if (nmId == null) {
      return { error: 'Товар не привязан к WB (нет nm_id). Сначала выгрузите товар на WB.' };
    }
    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) {
      return { error: 'Wildberries не подключён' };
    }
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      return { error: 'Ошибка доступа к WB' };
    }
    const barcode = await adapter.getBarcodeByNmId(nmId);
    return barcode ? { barcode } : { error: 'Штрих-код не найден в WB' };
  }

  /**
   * Загрузить штрих-код с WB и сохранить в Product.
   * Штрих-код вводить вручную нельзя — только с маркета.
   */
  async loadAndSaveWbBarcode(userId: string, productId: string): Promise<{ barcode: string } | { error: string }> {
    const result = await this.getWbBarcodeForProduct(userId, productId);
    if ('error' in result) return result;
    await this.prisma.product.update({
      where: { id: productId },
      data: { barcodeWb: result.barcode },
    });
    return result;
  }

  /**
   * Загрузить штрих-код с Ozon и сохранить в Product.
   * Штрих-код вводить вручную нельзя — только с маркета.
   * Важно: возвращаем только штрих-код из Ozon API, никогда не подставляем barcodeWb.
   * productIdOrArticle: UUID, displayId (0001) или артикул (edc002).
   */
  async loadAndSaveOzonBarcode(userId: string, productIdOrArticle: string): Promise<{ barcode: string } | { error: string }> {
    const product = await this.productsService.findByArticleOrId(userId, productIdOrArticle);
    if (!product) throw new BadRequestException('Товар не найден');
    const ids = await this.getEffectiveUserIds(userId);
    const ozonMapping = await this.productMappingService.getOzonMappingForUserIds(product.id, ids, (product.article ?? '').toString().trim());
    // product_id из маппинга — надёжная связка с Ozon (приоритет над offer_id)
    const ozonProductId = (ozonMapping?.externalSystemId ?? '').toString().trim() || null;
    const offerId = (ozonMapping?.externalArticle ?? product.article ?? product.sku ?? '').toString().trim();
    if (!ozonProductId && !offerId) return { error: 'Товар не привязан к Ozon и артикул не указан' };
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) return { error: 'Ozon не подключён' };
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) return { error: 'Ошибка доступа к Ozon' };
    // Ozon генерирует штрих-код автоматически при импорте. Ждём до ~21 сек (генерация до 15–20 сек).
    let barcode: string | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      barcode = await adapter.getBarcodeByProductId(ozonProductId ?? '', offerId || undefined);
      if (barcode) break;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 5000));
      } else if (attempt < 5) {
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
    if (!barcode) return { error: 'Штрих-код не найден в Ozon. Проверьте артикул (должен совпадать с offer_id на Ozon).' };
    await this.prisma.product.update({
      where: { id: product.id },
      data: { barcodeOzon: barcode },
    });
    return { barcode };
  }

  /**
   * Дерево категорий Ozon для выбора при создании товара.
   * Требует подключённый Ozon.
   */
  async getOzonCategoryTree(userId: string): Promise<OzonCategoryNode[]> {
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) throw new BadRequestException('Ozon не подключён. Подключите в разделе Маркетплейсы.');
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      throw new BadRequestException('Ошибка доступа к Ozon');
    }
    return adapter.getCategoryTree();
  }

  /**
   * Список складов WB (ID + название) для выбора при настройке подключения.
   */
  async getWbWarehouseList(userId: string): Promise<Array<{ id: string; name?: string }>> {
    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) throw new BadRequestException('Wildberries не подключён. Подключите в разделе Маркетплейсы.');
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      encryptedStatsToken: conn.statsToken ?? undefined,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      throw new BadRequestException('Ошибка доступа к Wildberries');
    }
    return adapter.getWarehouseList();
  }

  /**
   * Список категорий WB (subjects) для выбора при создании карточки.
   */
  /**
   * Возвращает список предметов (категорий) WB.
   *
   * Архитектура: глобальный DB-кеш с TTL 30 дней.
   * - Попадание в кеш → мгновенный ответ из БД, без WB API.
   * - Промах / устаревший кеш → запрос к WB API с токеном пользователя,
   *   обновление таблицы wb_subject, ответ из БД.
   * - Cron-задача обновляет кеш в 03:00 первого числа каждого месяца.
   */
  async getWbCategoryList(userId: string): Promise<Array<{ subjectId: number; subjectName: string }>> {
    const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
    const cutoff = new Date(Date.now() - CACHE_TTL_MS);

    const freshCount = await this.prisma.wbSubject.count({
      where: { updatedAt: { gte: cutoff } },
    });

    if (freshCount > 0) {
      // Cache hit — возвращаем из БД без WB API
      const rows = await this.prisma.wbSubject.findMany({ orderBy: { name: 'asc' } });
      return rows.map((r) => ({ subjectId: r.id, subjectName: r.name }));
    }

    // Cache miss — обновляем через токен запрашивающего пользователя
    return this.refreshWbSubjectCache(userId);
  }

  private async refreshWbSubjectCache(userId: string): Promise<Array<{ subjectId: number; subjectName: string }>> {
    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) throw new BadRequestException('Wildberries не подключён. Подключите в разделе Маркетплейсы.');
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      encryptedStatsToken: conn.statsToken ?? undefined,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      throw new BadRequestException('Ошибка доступа к Wildberries');
    }
    try {
      const categories = await adapter.getCategoryList();

      // Upsert: добавляем новые, не трогаем уже существующие (skipDuplicates)
      await this.prisma.wbSubject.createMany({
        data: categories.map((c) => ({ id: c.subjectId, name: c.subjectName })),
        skipDuplicates: true,
      });
      // Обновляем updatedAt для ВСЕХ записей — сбрасываем TTL
      await this.prisma.wbSubject.updateMany({ data: { updatedAt: new Date() } });

      const rows = await this.prisma.wbSubject.findMany({ orderBy: { name: 'asc' } });
      return rows.map((r) => ({ subjectId: r.id, subjectName: r.name }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось загрузить категории WB';
      throw new BadRequestException(msg);
    }
  }

  /**
   * Список складов Ozon (ID + название) для выбора при настройке подключения.
   */
  async getOzonWarehouseList(userId: string): Promise<Array<{ warehouse_id: number; name?: string }>> {
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) throw new BadRequestException('Ozon не подключён. Подключите в разделе Маркетплейсы.');
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      throw new BadRequestException('Ошибка доступа к Ozon');
    }
    return adapter.getWarehouseList();
  }

  /**
   * Атрибуты категории Ozon (обязательные и опциональные).
   */
  async getOzonCategoryAttributes(
    userId: string,
    descriptionCategoryId: number,
    typeId: number,
  ): Promise<OzonAttributeInfo[]> {
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) throw new BadRequestException('Ozon не подключён.');
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      throw new BadRequestException('Ошибка доступа к Ozon');
    }
    return adapter.getCategoryAttributes(descriptionCategoryId, typeId);
  }

  /**
   * Проверка перед выгрузкой на Ozon: обязательные поля.
   * Маппинг: title→name, article→offer_id, imageUrl→images, price→price,
   * weight→weight, width/length/height→dimensions, brand→attributes[4180], description→description.
   */
  validateProductForOzon(product: {
    title?: string | null;
    imageUrl?: string | null;
    cost?: unknown;
    price?: unknown;
    oldPrice?: unknown;
    article?: string | null;
    sku?: string | null;
    weight?: number | null;
    width?: number | null;
    length?: number | null;
    height?: number | null;
    ozonCategoryId?: number | null;
    ozonTypeId?: number | null;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!product.title?.trim()) errors.push('Укажите название товара');
    if (!product.imageUrl?.trim() || !product.imageUrl.startsWith('http'))
      errors.push('Добавьте URL фото товара (Ozon требует хотя бы одно изображение)');
    // Ваша цена (продажная) — обязательна для Ozon
    const price = product.price != null ? Number(product.price) : NaN;
    if (isNaN(price) || price < 20) errors.push('Укажите «Вашу цену» от 20 ₽ (Ozon: минимальная цена)');
    // Цена до скидки — если указана, должна быть больше price
    if (product.oldPrice != null) {
      const oldPrice = Number(product.oldPrice);
      if (!isNaN(oldPrice) && oldPrice <= price) {
        errors.push('«Цена до скидки» должна быть больше «Вашей цены»');
      }
      // При price ≤ 400: скидка должна быть > 20%
      if (!isNaN(price) && price <= 400 && !isNaN(oldPrice)) {
        const minOldPrice = Math.ceil(price / 0.79);
        if (oldPrice < minOldPrice) {
          errors.push(`При цене ≤ 400 ₽ скидка должна быть > 20%. Минимальная «цена до скидки»: ${minOldPrice} ₽`);
        }
      }
    }
    const article = (product.article ?? product.sku ?? '').toString().trim();
    if (!article) errors.push('Укажите артикул (offer_id) — обязателен для Ozon');
    const catId = product.ozonCategoryId != null ? Number(product.ozonCategoryId) : NaN;
    const typeId = product.ozonTypeId != null ? Number(product.ozonTypeId) : NaN;
    if (isNaN(catId) || catId <= 0 || isNaN(typeId) || typeId <= 0)
      errors.push('Выберите категорию Ozon (третий уровень категории)');
    const weight = product.weight != null ? Number(product.weight) : NaN;
    if (isNaN(weight) || weight <= 0) errors.push('Укажите вес в граммах (Ozon: weight)');
    const width = product.width != null ? Number(product.width) : NaN;
    if (isNaN(width) || width <= 0) errors.push('Укажите ширину в мм (Ozon: width)');
    const lengthVal = product.length != null ? Number(product.length) : NaN;
    if (isNaN(lengthVal) || lengthVal <= 0) errors.push('Укажите длину в мм (Ozon: depth)');
    const height = product.height != null ? Number(product.height) : NaN;
    if (isNaN(height) || height <= 0) errors.push('Укажите высоту в мм (Ozon: height)');
    return { valid: errors.length === 0, errors };
  }

  /** Список названий цветов WB из БД (для валидации при выгрузке) */
  async getWbColorNames(): Promise<string[]> {
    const rows = await this.prisma.wbColor.findMany({ select: { name: true } });
    return rows.map((r) => r.name);
  }

  /** Справочник цветов WB из API — для выбора в UI */
  async getWbColors(userId: string): Promise<Array<{ id: number; name: string }>> {
    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) {
      throw new Error('WB не подключён');
    }
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      throw new Error('Ошибка доступа к WB');
    }
    return adapter.getColors();
  }

  /**
   * Проверка перед выгрузкой на WB: обязательные поля.
   * Маппинг: title→Наименование, article→supplierVendorCode, imageUrl→Фото, wbSubjectId→subjectId.
   * WB требует: название, артикул, категория, фото, цена, бренд, описание, вес, габариты (мм).
   * @param options.wbColorNames — если задан и у товара указан цвет, он должен быть из справочника WB.
   */
  validateProductForWb(
    product: {
      title?: string | null;
      imageUrl?: string | null;
      imageUrls?: unknown;
      price?: unknown;
      article?: string | null;
      sku?: string | null;
      wbSubjectId?: number | null;
      color?: string | null;
      brand?: string | null;
      description?: string | null;
      weight?: number | null;
      width?: number | null;
      length?: number | null;
      height?: number | null;
    },
    options?: { wbColorNames?: string[] },
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!product.title?.trim()) errors.push('Укажите название товара');
    const hasMainPhoto = product.imageUrl?.trim().startsWith('http');
    const urls = Array.isArray(product.imageUrls) ? product.imageUrls : [];
    const hasExtraPhotos = urls.some((u: unknown) => typeof u === 'string' && (u as string).trim().startsWith('http'));
    if (!hasMainPhoto && !hasExtraPhotos)
      errors.push('Добавьте URL фото товара в поле «Фото» или «Доп. фото для WB» (WB требует хотя бы одно изображение)');
    const price = product.price != null ? Number(product.price) : NaN;
    if (isNaN(price) || price <= 0) errors.push('Укажите «Вашу цену» (WB: price в sizes)');
    const article = (product.article ?? product.sku ?? '').toString().trim();
    if (!article) errors.push('Укажите артикул (vendor code) — обязателен для WB');
    const subjectId = product.wbSubjectId != null ? Number(product.wbSubjectId) : NaN;
    if (isNaN(subjectId) || subjectId <= 0)
      errors.push('Выберите категорию WB (обязательное поле для выгрузки)');
    const brand = (product.brand ?? '').toString().trim();
    if (!brand) errors.push('Укажите бренд (WB: обязательное поле)');
    const desc = (product.description ?? '').toString().trim();
    if (!desc) errors.push('Добавьте описание товара (WB: обязательное поле)');
    const weight = product.weight != null ? Number(product.weight) : NaN;
    if (isNaN(weight) || weight <= 0) errors.push('Укажите вес в граммах (WB: обязательное поле)');
    const width = product.width != null ? Number(product.width) : NaN;
    if (isNaN(width) || width <= 0) errors.push('Укажите ширину в мм (WB: обязательное поле)');
    const length = product.length != null ? Number(product.length) : NaN;
    if (isNaN(length) || length <= 0) errors.push('Укажите длину в мм (WB: обязательное поле)');
    const height = product.height != null ? Number(product.height) : NaN;
    if (isNaN(height) || height <= 0) errors.push('Укажите высоту в мм (WB: обязательное поле)');
    const color = (product.color ?? '').toString().trim();
    if (color && options?.wbColorNames?.length) {
      if (!options.wbColorNames.includes(color)) {
        errors.push(
          'Цвет должен быть из справочника WB. Синхронизируйте цвета в настройках маркетплейсов и выберите из списка.',
        );
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Проверить, создана ли карточка товара на Ozon. GET /api/marketplaces/ozon-check/:productIdOrArticle
   * productIdOrArticle: UUID, displayId или артикул (edc002).
   */
  async getOzonProductCheck(userId: string, productIdOrArticle: string) {
    const product = await this.productsService.findByIdWithMappingsByArticleOrId(userId, productIdOrArticle);
    if (!product) throw new BadRequestException('Товар не найден');
    const ids = await this.getEffectiveUserIds(userId);
    const ozonMapping = await this.productMappingService.getOzonMappingForUserIds(product.id, ids, (product.article ?? '').toString().trim());
    const ozonProductId = ozonMapping?.externalSystemId ?? null;
    // externalArticle — фактический offer_id на Ozon (приоритет над product.article)
    const offerIdFromMapping = ozonMapping?.externalArticle?.trim() || null;
    const offerIdFromProduct = (product.article ?? product.sku ?? '').toString().trim() || null;
    const offerIdsToTry: string[] = [...new Set([offerIdFromMapping, offerIdFromProduct].filter((x): x is string => !!x))];

    if (!ozonProductId && offerIdsToTry.length === 0) {
      return {
        exists: false,
        hint: 'Товар не привязан к Ozon и артикул не указан. Сначала выгрузите его на Ozon.',
      };
    }
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) {
      return { exists: false, hint: 'Ozon не подключён. Подключите в разделе Маркетплейсы.' };
    }
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      return { exists: false, hint: 'Ошибка доступа к Ozon' };
    }
    let ozonInfo = ozonProductId ? await adapter.getProductInfoByProductId(ozonProductId) : null;
    let foundByOfferId = false;

    // Fallback: по offer_id (externalArticle из маппинга или product.article)
    if (!ozonInfo && offerIdsToTry.length > 0) {
      for (const offerId of offerIdsToTry) {
        if (!offerId) continue;
        ozonInfo = await adapter.getProductInfoByOfferId(offerId);
        if (ozonInfo) {
          foundByOfferId = true;
          break;
        }
      }
    }

    if (!ozonInfo) {
      const rawByProductId = ozonProductId ? await adapter.getProductInfoByProductIdWithRaw(ozonProductId) : null;
      const rawByOfferId = offerIdsToTry[0] ? await adapter.getProductInfoByOfferIdWithRaw(offerIdsToTry[0]) : null;
      return {
        exists: false,
        ozonProductId: ozonProductId ?? undefined,
        offerIdsTried: offerIdsToTry,
        hint: 'Карточка не найдена на Ozon по product_id и по артикулу. Возможно, товар ещё обрабатывается или удалён.',
        debug: { rawByProductId, rawByOfferId },
      };
    }

    const actualProductId = String(ozonInfo.id ?? ozonProductId);
    const actualOfferId = (ozonInfo.offer_id ?? product.article ?? '').toString().trim();
    if (foundByOfferId && (actualProductId !== ozonProductId || (ozonMapping?.externalArticle ?? '') !== actualOfferId)) {
      await this.productMappingService.updateOzonMappingForUserIds(
        product.id,
        ids,
        actualProductId,
        actualOfferId || (product.article ?? '').toString().trim(),
      );
    }

    const bc = ozonInfo.barcodes;
    const barcodeVal = (Array.isArray(bc) && bc.length > 0
      ? (typeof bc[0] === 'string' ? bc[0] : (bc[0] as { barcode?: string })?.barcode)
      : ozonInfo.barcode) ?? null;
    return {
      exists: true,
      ozonProductId: actualProductId,
      offer_id: ozonInfo.offer_id ?? null,
      name: ozonInfo.name ?? null,
      barcode: typeof barcodeVal === 'string' ? barcodeVal : null,
      link: `https://seller.ozon.ru/app/products/${actualProductId}`,
      localStock: product.stock,
      warehouseId: conn.warehouseId ?? null,
      warehouseConfigured: !!conn.warehouseId?.trim(),
      ...(foundByOfferId ? { hint: 'Найдено по артикулу. Связка product_id обновлена.' } : {}),
    };
  }

  /**
   * Диагностика остатков Ozon: товар по артикулу или displayId.
   * GET /api/marketplaces/ozon-stock/:article
   */
  async getOzonStockForProduct(
    userId: string,
    displayIdOrArticle: string,
  ): Promise<{
    article?: string;
    displayId: string;
    localStock: number;
    ozonProductId?: string;
    offer_id?: string | null;
    warehouseId?: string | null;
    warehouseConfigured: boolean;
    error?: string;
  }> {
    const product = await this.productsService.findByArticleOrId(userId, displayIdOrArticle);
    if (!product) throw new BadRequestException('Товар не найден');
    const ozonProductId = await this.productMappingService.getExternalId(product.id, userId, 'OZON');
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) {
      return {
        displayId: String(product.displayId).padStart(4, '0'),
        article: product.article ?? undefined,
        localStock: product.stock,
        warehouseConfigured: false,
        error: 'Ozon не подключён',
      };
    }
    if (!ozonProductId) {
      return {
        displayId: String(product.displayId).padStart(4, '0'),
        article: product.article ?? undefined,
        localStock: product.stock,
        warehouseConfigured: !!conn.warehouseId?.trim(),
        error: 'Товар не привязан к Ozon (нет product_id в маппинге). Импортируйте с Ozon или выгрузите товар.',
      };
    }
    const check = await this.getOzonProductCheck(userId, product.id);
    return {
      displayId: String(product.displayId).padStart(4, '0'),
      article: product.article ?? undefined,
      localStock: product.stock,
      ozonProductId: (check as { ozonProductId?: string }).ozonProductId,
      offer_id: (check as { offer_id?: string | null }).offer_id,
      warehouseId: conn.warehouseId ?? null,
      warehouseConfigured: !!conn.warehouseId?.trim(),
      ...(!(check as { exists?: boolean }).exists && { error: (check as { hint?: string }).hint }),
    };
  }

  /**
   * Удалить связку Ozon по externalSystemId (product_id на Ozon).
   * Когда у карточки несколько Ozon-связок — удалить лишнюю.
   * POST /api/marketplaces/ozon-delete-mapping/:productId
   */
  async deleteOzonMapping(
    userId: string,
    productIdOrArticle: string,
    externalSystemId: string,
  ): Promise<{ success: true } | { success: false; error: string }> {
    const product = await this.productsService.findByArticleOrId(userId, productIdOrArticle);
    if (!product) return { success: false, error: 'Товар не найден' };
    const ids = await this.getEffectiveUserIds(userId);
    const deleted = await this.productMappingService.deleteMapping(
      product.id,
      ids,
      'OZON',
      externalSystemId.trim(),
    );
    if (!deleted) return { success: false, error: 'Связка не найдена' };
    return { success: true };
  }

  /**
   * Обновить связку с Ozon по текущему артикулу товара.
   * Когда клиент исправил артикул или создал новый товар на Ozon с правильным offer_id —
   * ищет товар на Ozon по product.article и обновляет маппинг.
   * POST /api/marketplaces/ozon-refresh-mapping/:productId
   */
  async refreshOzonMapping(userId: string, productIdOrArticle: string): Promise<
    { success: true; product_id: string; offer_id: string } | { success: false; error: string }
  > {
    const product = await this.productsService.findByArticleOrId(userId, productIdOrArticle);
    if (!product) return { success: false, error: 'Товар не найден' };
    const article = (product.article ?? product.sku ?? '').toString().trim();
    if (!article) return { success: false, error: 'Укажите артикул товара' };
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) return { success: false, error: 'Ozon не подключён' };
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      return { success: false, error: 'Ошибка доступа к Ozon' };
    }
    const ozonInfo = await adapter.getProductInfoByOfferId(article);
    if (!ozonInfo?.id) {
      return { success: false, error: `Товар с артикулом «${article}» не найден на Ozon. Создайте его или проверьте артикул.` };
    }
    const newProductId = String(ozonInfo.id);
    const newOfferId = (ozonInfo.offer_id ?? article).toString().trim();
    const ids = await this.getEffectiveUserIds(userId);
    const updated = await this.productMappingService.updateOzonMappingForUserIds(
      product.id,
      ids,
      newProductId,
      newOfferId,
    );
    if (!updated) {
      // Маппинга нет — создаём (товар на Ozon создан вручную или импортирован)
      await this.productMappingService.upsertMapping(product.id, userId, 'OZON', newProductId, {
        externalArticle: newOfferId,
      });
    }
    return { success: true, product_id: newProductId, offer_id: newOfferId };
  }

  /**
   * Принудительно отправить остаток на Ozon (при расхождении).
   * POST /api/marketplaces/ozon-stock/:article/sync
   */
  async forceSyncOzonStock(
    userId: string,
    displayIdOrArticle: string,
  ): Promise<{ ok: boolean; message: string }> {
    const ids = await this.getEffectiveUserIds(userId);
    let product = null;
    for (const uid of ids) {
      product = await this.productsService.findByArticleOrId(uid, displayIdOrArticle);
      if (product) break;
    }
    if (!product) throw new BadRequestException('Товар не найден');
    const ozonProductId = await this.productMappingService.getExternalIdForUserIds(product.id, ids, 'OZON');
    if (!ozonProductId) {
      return { ok: false, message: 'Товар не привязан к Ozon' };
    }
    const results = await this.syncProducts(
      userId,
      [
        {
          id: product.id,
          name: product.title,
          stock: product.stock,
          images: product.imageUrl ? [product.imageUrl] : [],
          ozonProductId,
          vendorCode: (product.article ?? product.sku ?? '').toString().trim() || undefined,
        },
      ],
      'OZON',
    );
    const r = results[0];
    return {
      ok: r?.success ?? false,
      message: r?.success ? `Остаток ${product.stock} отправлен на Ozon` : (r?.errors?.[0] ?? 'Ошибка синхронизации'),
    };
  }

  /**
   * Пошаговая диагностика остатков Ozon: запросы и ответы на каждом шаге.
   * GET /api/marketplaces/ozon-stock-debug/:article
   */
  async ozonStockDebugStepByStep(userId: string, displayIdOrArticle: string): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    const ids = await this.getEffectiveUserIds(userId);

    // Шаг 1: Найти товар (свои или привязанного пользователя)
    let product = null;
    for (const uid of ids) {
      product = await this.productsService.findByArticleOrId(uid, displayIdOrArticle);
      if (product) break;
    }
    if (!product) {
      result.step1_error = 'Товар не найден';
      return result;
    }
    result.step1_product = {
      id: product.id,
      displayId: String(product.displayId).padStart(4, '0'),
      article: product.article,
      title: product.title,
      stock: product.stock,
    };

    // Шаг 2: Маппинг Ozon
    const mapping = await this.prisma.productMarketplaceMapping.findFirst({
      where: { productId: product.id, userId: { in: ids }, marketplace: 'OZON', isActive: true },
    });
    if (!mapping) {
      result.step2_error = 'Товар не привязан к Ozon (нет ProductMarketplaceMapping)';
      return result;
    }
    result.step2_mapping = {
      externalSystemId: mapping.externalSystemId,
      externalArticle: mapping.externalArticle,
    };

    // Шаг 3: Подключение Ozon
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) {
      result.step3_error = 'Ozon не подключён';
      return result;
    }
    if (!conn.warehouseId?.trim()) {
      result.step3_error = 'warehouse_id не указан. Укажите склад в Маркетплейсы → Ozon → «Загрузить склады»';
      result.step3_connection = { hasConnection: true, hasWarehouse: false };
      return result;
    }
    result.step3_connection = {
      hasConnection: true,
      hasWarehouse: true,
      warehouseId: conn.warehouseId,
    };

    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      result.step3_error = 'Ошибка создания адаптера Ozon';
      return result;
    }

    const offerId = mapping.externalArticle?.trim() || (product.article ?? product.sku ?? '').toString().trim() || null;
    const productId = mapping.externalSystemId;

    // Шаг 4: Получить текущие остатки с Ozon
    try {
      const stocks = await adapter.getProductStocks(offerId ? [offerId] : []);
      result.step4_getStocks = {
        request: { filter: { visibility: 'ALL', offer_id: offerId ? [offerId] : [] } },
        response: stocks,
        status: 200,
      };
    } catch (err) {
      result.step4_error = err instanceof Error ? err.message : String(err);
    }

    // Шаг 5: Отправить остатки на Ozon
    if (offerId && productId) {
      try {
        const setResult = await adapter.setStockWithResponse(offerId, productId, product.stock);
        result.step5_setStock = setResult;
      } catch (err) {
        result.step5_error = err instanceof Error ? err.message : String(err);
      }
    } else {
      result.step5_error = `offer_id или product_id не указаны. offer_id=${offerId ?? 'null'}, product_id=${productId ?? 'null'}`;
    }

    return result;
  }

  /**
   * Обеспечить наличие товара в каталоге для Ozon product_id.
   * Если товар не найден — загружает с Ozon и создаёт Product + mapping.
   * Используется при синхронизации заказов FBO, когда товар ещё не в каталоге.
   */
  async ensureOzonProductInCatalog(
    userId: string,
    ozonProductId: string,
  ): Promise<{ id: string; userId: string } | null> {
    const existing = await this.productMappingService.findProductByExternalId(userId, 'OZON', ozonProductId);
    if (existing) return existing;
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) return null;
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) return null;
    const p = await adapter.getProductFromOzonByProductId(ozonProductId);
    if (!p) {
      console.warn(`[ensureOzonProductInCatalog] Ozon API не вернул товар для product_id/sku=${ozonProductId}, создаём placeholder`);
      // Fallback: товар не найден в Ozon (архив, другой аккаунт, FBO cross-dock) — создаём placeholder, чтобы заказ синхронизировался
      const placeholderArticle = `OZON_${ozonProductId}`;
      const existingPlaceholder = await this.productsService.findByArticle(userId, placeholderArticle);
      if (existingPlaceholder) {
        await this.productMappingService.upsertMapping(existingPlaceholder.id, userId, 'OZON', ozonProductId, {
          externalArticle: placeholderArticle,
        });
        return existingPlaceholder;
      }
      try {
        const created = await this.productsService.create(userId, {
          title: `Товар Ozon ${ozonProductId}`,
          article: placeholderArticle,
          cost: 0,
        });
        await this.productMappingService.upsertMapping(created.id, userId, 'OZON', ozonProductId, {
          externalArticle: placeholderArticle,
        });
        return created;
      } catch (err) {
        console.warn(`[ensureOzonProductInCatalog] Не удалось создать placeholder для ${ozonProductId}:`, err);
        return null;
      }
    }
    const byArticle = await this.productsService.findByArticle(userId, p.offerId);
    if (byArticle) {
      await this.productMappingService.upsertMapping(byArticle.id, userId, 'OZON', String(p.productId), {
        externalArticle: p.offerId,
      });
      return byArticle;
    }
    try {
      const created = await this.productsService.create(userId, {
        title: p.name,
        description: p.description?.slice(0, 5000),
        cost: 0,
        imageUrl: p.imageUrl,
        article: p.offerId,
        barcodeOzon: p.barcode,
        weight: p.weight,
        width: p.width,
        height: p.height,
        length: p.length,
        ozonCategoryId: p.ozonCategoryId,
        ozonTypeId: p.ozonTypeId,
      });
      await this.productMappingService.upsertMapping(created.id, userId, 'OZON', String(p.productId), {
        externalArticle: p.offerId,
      });
      return created;
    } catch {
      return null;
    }
  }

  /**
   * Получить offer_id (артикул) по product_id Ozon — для fallback-связки по артикулу при заказах.
   * Используется, когда маппинг отсутствует, но товар на Ozon создан с тем же артикулом.
   */
  async getOzonOfferIdByProductId(userId: string, ozonProductId: string): Promise<string | null> {
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) return null;
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) return null;
    const info = await adapter.getProductInfoByProductId(ozonProductId);
    const offerId = (info?.offer_id ?? '').toString().trim();
    return offerId || null;
  }

  /**
  /**
   * Диагностика Ozon FBS: сырой ответ API + пошаговый трейс маппинга для каждого отправления.
   * Позволяет найти причину, почему FBS-заказы не попадают в систему.
   */
  async diagOzonFbsRaw(userId: string, days: number) {
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) return { error: 'Ozon не подключён', conn: null };

    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) return { error: 'Не удалось создать адаптер Ozon' };

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // 1. Сырой ответ FBS API (через приватный метод HTTP)
    let rawFbsResponse: unknown = null;
    let rawFbsError: string | null = null;
    try {
      rawFbsResponse = await (adapter as OzonAdapter).diagGetFbsRaw(since);
    } catch (err) {
      rawFbsError = err instanceof Error ? err.message : String(err);
    }

    // 2. Распарсенные заказы через getOrders (после нашего фикса)
    let parsedOrders: unknown = null;
    let parsedError: string | null = null;
    try {
      parsedOrders = await adapter.getOrders(since);
    } catch (err) {
      parsedError = err instanceof Error ? err.message : String(err);
    }

    // 3. Трейс маппинга: для каждого заказа проверяем, найден ли товар
    const mappingTrace: Array<{
      postingNumber: string;
      productId: string;
      mappingFound: boolean;
      mappingProductId?: string;
      mappingProductTitle?: string;
      mappingError?: string;
    }> = [];

    if (Array.isArray(parsedOrders)) {
      for (const od of (parsedOrders as Array<{ marketplaceOrderId: string; productId: string }>) .slice(0, 20)) {
        try {
          const product = await this.productMappingService.findProductByExternalId(userId, 'OZON', od.productId);
          mappingTrace.push({
            postingNumber: od.marketplaceOrderId,
            productId: od.productId,
            mappingFound: !!product,
            mappingProductId: product?.id,
            mappingProductTitle: (product as { title?: string } | null)?.title,
          });
        } catch (err) {
          mappingTrace.push({
            postingNumber: od.marketplaceOrderId,
            productId: od.productId,
            mappingFound: false,
            mappingError: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // 4. Существующие маппинги Ozon в БД
    const existingMappings = await this.prisma.productMarketplaceMapping.findMany({
      where: { userId, marketplace: 'OZON' },
      include: { product: { select: { id: true, title: true, article: true } } },
      take: 20,
    });

    return {
      connectionInfo: {
        hasSellerId: !!conn.sellerId,
        hasToken: !!conn.token,
        warehouseId: conn.warehouseId,
        sinceDate: since.toISOString(),
      },
      rawFbsResponse,
      rawFbsError,
      parsedOrdersCount: Array.isArray(parsedOrders) ? (parsedOrders as unknown[]).length : null,
      parsedOrders: Array.isArray(parsedOrders) ? (parsedOrders as unknown[]).slice(0, 5) : null,
      parsedError,
      mappingTrace,
      existingOzonMappings: existingMappings.map((m) => ({
        externalSystemId: m.externalSystemId,
        externalArticle: m.externalArticle,
        productTitle: m.product?.title,
        productArticle: m.product?.article,
      })),
    };
  }

  /**
   * Проверка подключения к Ozon. GET /api/marketplaces/ozon-test
   * Проверяет наличие Client-Id и успешность запроса к API.
   */
  async testOzonConnection(userId: string): Promise<{
    ok: boolean;
    hasConnection: boolean;
    hasSellerId: boolean;
    message?: string;
    lastError?: string | null;
  }> {
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn) {
      return { ok: false, hasConnection: false, hasSellerId: false, message: 'Ozon не подключён' };
    }
    const hasSellerId = !!(conn.sellerId?.trim());
    if (!hasSellerId) {
      return {
        ok: false,
        hasConnection: true,
        hasSellerId: false,
        message: 'Укажите Client ID в настройках подключения Ozon (Маркетплейсы → отключить и подключить заново)',
        lastError: conn.lastError,
      };
    }
    if (!conn.token) {
      return {
        ok: false,
        hasConnection: true,
        hasSellerId,
        message: 'API Key отсутствует. Переподключите Ozon.',
        lastError: conn.lastError,
      };
    }
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      return {
        ok: false,
        hasConnection: true,
        hasSellerId,
        message: 'Ошибка создания адаптера Ozon',
        lastError: conn.lastError,
      };
    }
    try {
      const authenticated = await adapter.authenticate();
      if (!authenticated) {
        return {
          ok: false,
          hasConnection: true,
          hasSellerId,
          message: 'Ozon API вернул ошибку. Проверьте Client ID и API Key в ЛК продавца.',
          lastError: conn.lastError,
        };
      }
      return {
        ok: true,
        hasConnection: true,
        hasSellerId,
        message: 'Подключение к Ozon успешно',
        lastError: conn.lastError,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        hasConnection: true,
        hasSellerId,
        message: msg.startsWith('Ozon:') ? msg.replace(/^Ozon:\s*/, '') : msg,
        lastError: conn.lastError,
      };
    }
  }

  /**
   * Диагностика связок HandySeller ↔ Ozon. Таблица полей идентификации.
   * GET /api/marketplaces/ozon-debug/:productId
   */
  async getOzonProductDebug(userId: string, productId: string) {
    const product = await this.productsService.findByIdWithMappings(userId, productId);
    if (!product) throw new BadRequestException('Товар не найден');
    const ids = await this.getEffectiveUserIds(userId);
    const ozonMapping = await this.productMappingService.getOzonMappingForUserIds(product.id, ids, (product.article ?? '').toString().trim());
    const ozonProductId = (ozonMapping?.externalSystemId ?? '').toString().trim() || null;
    if (!ozonProductId) return { error: 'Товар не привязан к Ozon' };
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) return { error: 'Ozon не подключён' };
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) return { error: 'Ошибка доступа к Ozon' };
    const ozonInfo = await adapter.getProductInfoByProductId(ozonProductId);
    const ozonOfferId = (ozonInfo?.offer_id ?? '').toString().trim() || null;
    // vendorCode при синхронизации: приоритет externalArticle из маппинга
    const syncVendorCode = ozonMapping?.externalArticle?.trim() || (product.article ?? product.sku ?? '').toString().trim() || null;
    const match = !!syncVendorCode && !!ozonOfferId && syncVendorCode === ozonOfferId;
    return {
      productName: product.title,
      /** HandySeller: наши поля */
      handyseller: {
        productId: product.id,
        displayId: String(product.displayId).padStart(4, '0'),
        article: product.article ?? null,
        sku: product.sku ?? null,
      },
      /** ProductMarketplaceMapping: связка с Ozon */
      mapping: {
        externalSystemId: ozonProductId,
        externalArticle: ozonMapping?.externalArticle ?? null,
      },
      /** Ozon: данные с API */
      ozon: {
        product_id: ozonProductId,
        offer_id: ozonOfferId,
        name: ozonInfo?.name ?? null,
        barcode: (ozonInfo as { barcode?: string })?.barcode ?? null,
        barcodes: (ozonInfo as { barcodes?: unknown })?.barcodes ?? null,
      },
      /** HandySeller: штрих-коды (для сравнения) */
      barcodes: {
        barcodeWb: (product as { barcodeWb?: string }).barcodeWb ?? null,
        barcodeOzon: (product as { barcodeOzon?: string }).barcodeOzon ?? null,
      },
      /** При синхронизации остатков будет использован этот offer_id */
      syncWillUseOfferId: syncVendorCode,
      /** Совпадает ли наш offer_id с Ozon */
      match,
      /** Все маппинги товара (для диагностики linked-аккаунтов и syncStock) */
      allMappings: await this.prisma.productMarketplaceMapping.findMany({
        where: { productId: product.id, isActive: true },
        select: { userId: true, marketplace: true, externalSystemId: true, externalArticle: true, syncStock: true },
      }),
      effectiveUserIds: ids,
    };
  }

  /**
   * Диагностика выгрузки на Ozon: попытка импорта с возвратом полного ответа API при ошибке.
   * POST /api/marketplaces/ozon-export-diagnostic/:productId
   */
  async getOzonExportDiagnostic(userId: string, productId: string) {
    const product = await this.productsService.findByIdWithMappings(userId, productId);
    if (!product) throw new BadRequestException('Товар не найден');
    const validation = this.validateProductForOzon(product);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('; '), validationErrors: validation.errors };
    }
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) {
      return { success: false, error: 'Ozon не подключён. Подключите в разделе Маркетплейсы.' };
    }
    const canonical = productToCanonical(product);
    canonical.barcode = (product as { barcodeOzon?: string }).barcodeOzon ?? undefined;
    const productData = canonicalToProductData(canonical, {
      barcodeOzon: (product as { barcodeOzon?: string }).barcodeOzon,
    });

    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      return { success: false, error: 'Ошибка доступа к Ozon' };
    }

    const result = await adapter.tryImportWithFullResponse(productData);
    if (result.success && result.productId) {
      await this.productMappingService.upsertMapping(
        productId,
        userId,
        'OZON',
        result.productId,
        productData.vendorCode ? { externalArticle: productData.vendorCode } : undefined,
      );
      await this.saveBarcodeFromMarketplace(userId, productId, 'OZON', result.productId);
    }
    return result;
  }

  /**
   * Предпросмотр выгрузки на Ozon: payload, маппинг полей, обязательные атрибуты категории.
   * GET /api/marketplaces/ozon-export-preview/:productId
   */
  async getOzonExportPreview(userId: string, productId: string) {
    const product = await this.productsService.findByIdWithMappings(userId, productId);
    if (!product) throw new BadRequestException('Товар не найден');
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) {
      return { error: 'Ozon не подключён. Подключите в разделе Маркетплейсы.' };
    }
    const canonical = productToCanonical(product);
    canonical.barcode = (product as { barcodeOzon?: string }).barcodeOzon ?? undefined;
    const productData = canonicalToProductData(canonical, {
      barcodeOzon: (product as { barcodeOzon?: string }).barcodeOzon,
    });

    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      return { error: 'Ошибка доступа к Ozon' };
    }

    let requiredAttributes: OzonAttributeInfo[] = [];
    try {
      const catId = product.ozonCategoryId ?? 17028922;
      const typeId = product.ozonTypeId ?? 91565;
      requiredAttributes = (await adapter.getCategoryAttributes(catId, typeId)).filter((a) => a.is_required);
    } catch {
      // Категория может быть недоступна
    }

    let payload: ReturnType<OzonAdapter['buildImportPayload']>;
    try {
      payload = adapter.buildImportPayload(productData, requiredAttributes.length > 0 ? requiredAttributes : undefined);
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        validation: this.validateProductForOzon(product),
      };
    }

    const sentAttributeIds = new Set(payload.attributeIds);
    const missingRequired = requiredAttributes.filter((a) => !sentAttributeIds.has(a.id));

    return {
      payload: payload.item,
      mapping: payload.mapping,
      category: {
        descriptionCategoryId: payload.descriptionCategoryId,
        typeId: payload.typeId,
      },
      requiredAttributesFromOzon: requiredAttributes.map((a) => ({ id: a.id, name: a.name, is_required: a.is_required })),
      missingRequiredAttributes: missingRequired.map((a) => ({ id: a.id, name: a.name })),
      validation: this.validateProductForOzon(product),
      timingNote:
        'Выгрузка занимает 15–25 сек: импорт (2 сек) → генерация штрихкода (5 сек) → сохранение штрихкода (до 9 сек).',
    };
  }

  /**
   * Диагностика выгрузки на WB: попытка загрузки с возвратом полного запроса и ответа API.
   * POST /api/marketplaces/wb-export-diagnostic/:productId
   */
  async getWbExportDiagnostic(userId: string, productId: string) {
    const product = await this.productsService.findByIdWithMappings(userId, productId);
    if (!product) throw new BadRequestException('Товар не найден');
    const validation = this.validateProductForWb(product, { wbColorNames: await this.getWbColorNames() });
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('; '), validationErrors: validation.errors };
    }
    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) {
      return { success: false, error: 'WB не подключён. Подключите в разделе Маркетплейсы.' };
    }
    const canonical = productToCanonical(product);
    const productData = canonicalToProductData(canonical);
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      encryptedStatsToken: conn.statsToken ?? undefined,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      return { success: false, error: 'Ошибка доступа к WB' };
    }
    const result = await adapter.tryUploadWithFullResponse(productData);
    return result;
  }

  /**
   * Предпросмотр выгрузки на WB: payload, маппинг полей.
   * GET /api/marketplaces/wb-export-preview/:productId
   */
  async getWbExportPreview(userId: string, productId: string) {
    const product = await this.productsService.findByIdWithMappings(userId, productId);
    if (!product) throw new BadRequestException('Товар не найден');
    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) {
      return { error: 'Wildberries не подключён. Подключите в разделе Маркетплейсы.' };
    }
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      encryptedStatsToken: conn.statsToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      return { error: 'Ошибка доступа к WB' };
    }
    const canonical = productToCanonical(product);
    let wbCharcs: Array<{ charcID: number; name: string; required?: boolean }> | undefined;
    if (canonical.wb_subject_id && canonical.wb_subject_id > 0) {
      wbCharcs = await adapter.getCharcsForSubject(canonical.wb_subject_id);
    }
    const barcodePlaceholder = '0000000000000'; // для предпросмотра, реальный генерируется при выгрузке
    let payload: Record<string, unknown>;
    try {
      payload = adapter.convertToPlatform(canonical, barcodePlaceholder, wbCharcs) as Record<string, unknown>;
    } catch (err) {
      const wbColorNames = await this.getWbColorNames();
      return {
        error: err instanceof Error ? err.message : String(err),
        validation: this.validateProductForWb(product, { wbColorNames }),
      };
    }
    const wbColorNames = await this.getWbColorNames();
    const mapping: Array<{ our: string; wb: string; value: unknown }> = [
      { our: 'title', wb: 'Наименование (characteristics)', value: product.title },
      { our: 'article', wb: 'supplierVendorCode, vendorCode', value: product.article },
      { our: 'price (Ваша цена)', wb: 'sizes[0].price', value: product.price != null ? Number(product.price) : null },
      { our: 'cost (Себестоимость)', wb: '— не передаётся', value: product.cost != null ? Number(product.cost) : null },
      { our: 'wbSubjectId', wb: 'subjectId', value: product.wbSubjectId },
      { our: 'imageUrl', wb: 'addin Фото', value: product.imageUrl },
      { our: 'brand', wb: 'brand', value: (product as { brand?: string }).brand ?? 'Ручная работа' },
    ];
    return {
      payload,
      mapping,
      validation: this.validateProductForWb(product, { wbColorNames }),
      fieldMappingNote: 'На WB передаётся только price (Ваша цена). cost (Себестоимость) не используется.',
    };
  }

  /** Отладка: проверить статус заказа 4645532575 на стороне WB */
  async getWbOrderStatus(userId: string, orderIdOrSrid: string) {
    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) {
      return { error: 'Wildberries не подключён' };
    }
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      encryptedStatsToken: conn.statsToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      return { error: 'Ошибка доступа к WB' };
    }
    const wbStatus = await adapter.getOrderStatusFromWb(orderIdOrSrid);
    const ourOrder = await this.prisma.order.findFirst({
      where: { userId, marketplace: 'WILDBERRIES', OR: [{ externalId: orderIdOrSrid }, { wbStickerNumber: orderIdOrSrid }] },
      select: { id: true, externalId: true, status: true, rawStatus: true, wbStickerNumber: true },
    });
    const statusFromWb = (wbStatus.wbStatus ?? wbStatus.supplierStatus ?? '').trim();
    const mappedStatus =
      wbStatus.found && statusFromWb
        ? mapWbStatusToOurs(statusFromWb)
        : null;
    return { wb: wbStatus, ourDb: ourOrder, mappedStatus };
  }

  /** Получить стикер заказа WB (PNG base64). Доступен при статусе confirm/complete в ЛК WB. */
  async getWbOrderSticker(userId: string, wbOrderId: string): Promise<{ file: string } | { error: string }> {
    const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
    if (!conn?.token) {
      return { error: 'Wildberries не подключён' };
    }
    const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      return { error: 'Ошибка доступа к WB' };
    }
    const orderIdNum = parseInt(wbOrderId, 10);
    if (isNaN(orderIdNum)) {
      return { error: 'Некорректный номер заказа WB' };
    }
    const stickers = await adapter.getStickers([orderIdNum]);
    const sticker = stickers.find((s) => s.orderId === orderIdNum) ?? stickers[0];
    if (!sticker?.file) {
      return { error: 'Стикер пока недоступен. Подтвердите заказ в ЛК WB (статус «На сборке»).' };
    }
    return { file: sticker.file };
  }

  getDecryptedToken(conn: { token: string | null; refreshToken: string | null }) {
    return {
      token: conn.token ? this.crypto.decrypt(conn.token) : null,
      refreshToken: conn.refreshToken ? this.crypto.decrypt(conn.refreshToken) : null,
    };
  }

  /**
   * Диагностика импорта с Ozon: сырой ответ /v3/product/list.
   */
  async getOzonImportDiagnostic(userId: string): Promise<{ status: number; data: unknown; error?: string }> {
    const conn = await this.getMarketplaceConnection(userId, 'OZON');
    if (!conn?.token) {
      throw new BadRequestException('Ozon не подключён');
    }
    const adapter = this.adapterFactory.createAdapter('OZON', {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      throw new BadRequestException('Ошибка доступа к Ozon');
    }
    return adapter.getProductListRaw();
  }

  /**
   * Импорт товаров с маркетплейса в каталог. Поддерживается Wildberries и Ozon.
   */
  async importProductsFromMarketplace(
    userId: string,
    marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
    options?: { onProgress?: (progress: { processed: number; total: number; percent: number }) => Promise<void> | void },
  ): Promise<{ imported: number; skipped: number; articlesUpdated?: number; errors: string[] }> {
    if (marketplace !== 'WILDBERRIES' && marketplace !== 'OZON') {
      throw new BadRequestException(`Импорт с ${marketplace} пока не поддерживается`);
    }

    const conn = await this.getMarketplaceConnection(userId, marketplace);
    if (!conn?.token) {
      throw new BadRequestException(`${marketplace === 'OZON' ? 'Ozon' : 'Wildberries'} не подключён. Сначала подключите маркетплейс.`);
    }

    const adapter = this.adapterFactory.createAdapter(marketplace, {
      encryptedToken: conn.token,
      encryptedRefreshToken: conn.refreshToken,
      sellerId: conn.sellerId ?? undefined,
      warehouseId: conn.warehouseId ?? undefined,
    });

    console.log(`[importProductsFromMarketplace] marketplace=${marketplace}, adapter=${adapter?.constructor?.name}, isOzonAdapter=${adapter instanceof OzonAdapter}`);

    if (marketplace === 'OZON') {
      if (!adapter || !(adapter instanceof OzonAdapter)) {
        throw new BadRequestException('Ошибка загрузки товаров с Ozon: неверный адаптер');
      }
      return this.importFromOzon(userId, conn, adapter, options);
    }

    if (!adapter || !(adapter instanceof WildberriesAdapter)) {
      throw new BadRequestException('Ошибка загрузки товаров с Wildberries');
    }

    const wbProducts = await withRetry(() => adapter.getProductsFromWb(), 'getProductsFromWb');
    let imported = 0;
    let skipped = 0;
    let articlesUpdated = 0;
    const errors: string[] = [];

    for (const p of wbProducts) {
      const sku = `WB-${userId.slice(0, 8)}-${p.nmId}`;
      const existing = await this.productsService.findBySku(userId, sku);
      if (existing) {
        // Обновить артикул, наименование и остальные поля для уже импортированных товаров
        const newTitle = (p.name || `Товар ${p.nmId}`).trim().slice(0, 500);
        const updates: Record<string, unknown> = {};
        if (p.vendorCode && existing.article !== p.vendorCode) updates.article = p.vendorCode;
        if (newTitle && existing.title !== newTitle) updates.title = newTitle;
        if (typeof p.description === 'string' && p.description.trim() && existing.description !== p.description.slice(0, 5000))
          updates.description = p.description.slice(0, 5000);
        // WB import always sets the WB main photo.
        // p.imageUrl comes from mediaFiles[0] (real WB CDN URL).
        // When WB genuinely provides no photos, we leave imageUrl untouched here;
        // backfillWbPhotos() runs after import and fills from CDN formula as last resort.
        if (p.imageUrl != null && existing.imageUrl !== p.imageUrl) updates.imageUrl = p.imageUrl;
        // Additional photos: only update when API returned multiple images
        if (p.images && p.images.length > 1) {
          const additionalImages = p.images.slice(1);
          const existingAdditional = Array.isArray((existing as { imageUrls?: unknown }).imageUrls)
            ? (existing as { imageUrls?: unknown[] }).imageUrls
            : [];
          if (JSON.stringify(existingAdditional) !== JSON.stringify(additionalImages))
            (updates as Record<string, unknown>).imageUrls = additionalImages;
        }
        if (p.brand != null && (existing as { brand?: string | null }).brand !== p.brand) updates.brand = p.brand;
        if (p.color != null && (existing as { color?: string | null }).color !== p.color) updates.color = p.color;
        if (p.weight != null && (existing as { weight?: number | null }).weight !== p.weight) updates.weight = p.weight;
        if (p.width != null && (existing as { width?: number | null }).width !== p.width) updates.width = p.width;
        if (p.length != null && (existing as { length?: number | null }).length !== p.length) updates.length = p.length;
        if (p.height != null && (existing as { height?: number | null }).height !== p.height) updates.height = p.height;
        if (p.itemsPerPack != null && (existing as { itemsPerPack?: number | null }).itemsPerPack !== p.itemsPerPack)
          updates.itemsPerPack = p.itemsPerPack;
        if (p.countryOfOrigin != null && (existing as { countryOfOrigin?: string | null }).countryOfOrigin !== p.countryOfOrigin)
          updates.countryOfOrigin = p.countryOfOrigin;
        if (p.material != null && (existing as { material?: string | null }).material !== p.material) updates.material = p.material;
        if (p.craftType != null && (existing as { craftType?: string | null }).craftType !== p.craftType) updates.craftType = p.craftType;
        if (p.packageContents != null && (existing as { packageContents?: string | null }).packageContents !== p.packageContents)
          updates.packageContents = p.packageContents;
        if (p.richContent != null && (existing as { richContent?: string | null }).richContent !== p.richContent)
          updates.richContent = p.richContent;
        // Fill category + barcode only if not yet set (don't overwrite manual changes)
        if (p.subjectId && !(existing as { wbSubjectId?: number | null }).wbSubjectId)
          updates.wbSubjectId = p.subjectId;
        if (p.subjectName && !(existing as { wbCategoryPath?: string | null }).wbCategoryPath)
          updates.wbCategoryPath = p.subjectName;
        if (p.barcode && !(existing as { barcodeWb?: string | null }).barcodeWb)
          updates.barcodeWb = p.barcode;
        if (Object.keys(updates).length > 0) {
          await this.prisma.product.update({
            where: { id: existing.id },
            data: updates,
          });
          articlesUpdated++;
        }
        await this.productMappingService.upsertMapping(existing.id, userId, 'WILDBERRIES', String(p.nmId), {
          externalArticle: p.vendorCode || undefined,
        });
        skipped++;
        continue;
      }
      try {
        const title = (p.name || `Товар ${p.nmId}`).trim().slice(0, 500);
        if (!title) continue;
        const created = await this.productsService.create(userId, {
          title,
          description: p.description?.slice(0, 5000),
          cost: 0,
          imageUrl: p.imageUrl, // real URL from WB API; backfillWbPhotos fills null later
          imageUrls: p.images && p.images.length > 1 ? p.images.slice(1) : undefined,
          sku,
          article: p.vendorCode || undefined,
          brand: p.brand,
          color: p.color,
          weight: p.weight,
          width: p.width,
          length: p.length,
          height: p.height,
          itemsPerPack: p.itemsPerPack,
          countryOfOrigin: p.countryOfOrigin,
          material: p.material,
          craftType: p.craftType,
          packageContents: p.packageContents,
          richContent: p.richContent,
          wbSubjectId: p.subjectId,
          wbCategoryPath: p.subjectName,
          barcodeWb: p.barcode,
        });
        await this.productMappingService.upsertMapping(created.id, userId, 'WILDBERRIES', String(p.nmId), {
          externalArticle: p.vendorCode || undefined,
        });
        imported++;
      } catch (err) {
        errors.push(`${p.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (imported > 0 || articlesUpdated > 0) {
      await this.prisma.marketplaceConnection.update({
        where: { id: conn.id },
        data: { lastSyncAt: new Date(), lastError: null },
      });
    }

    // Backfill CDN URLs for any WB products that still have no imageUrl
    await this.backfillWbPhotos(userId).catch(() => {/* non-critical */});

    return { imported, skipped, articlesUpdated: articlesUpdated > 0 ? articlesUpdated : undefined, errors };
  }

  /** Построить карту (description_category_id, type_id) -> путь категории из дерева Ozon */
  private buildOzonCategoryPathMap(tree: OzonCategoryNode[]): Map<string, string> {
    const map = new Map<string, string>();
    const walk = (nodes: OzonCategoryNode[], path: string[] = [], parentCatId?: number) => {
      for (const n of nodes) {
        const name = n.category_name || n.type_name || '';
        const currentPath = [...path, name].filter(Boolean);
        const catId = n.description_category_id ?? parentCatId;
        if (n.type_id != null && n.type_id > 0 && catId) {
          map.set(`${catId}-${n.type_id}`, currentPath.join(' > '));
        }
        if (n.children?.length) walk(n.children, currentPath, catId ?? parentCatId);
      }
    };
    walk(tree);
    return map;
  }

  /** Импорт товаров с Ozon */
  private async importFromOzon(
    userId: string,
    conn: { id: string },
    adapter: OzonAdapter,
    options?: { onProgress?: (progress: { processed: number; total: number; percent: number }) => Promise<void> | void },
  ): Promise<{ imported: number; skipped: number; articlesUpdated?: number; errors: string[] }> {
    console.log(`[importFromOzon] Starting import for userId=${userId}, connId=${conn.id}`);
    const [ozonProducts, categoryTree] = await Promise.all([
      withRetry(() => adapter.getProductsFromOzon(), 'getProductsFromOzon'),
      adapter.getCategoryTree().catch(() => [] as OzonCategoryNode[]),
    ]);
    const categoryPathMap = this.buildOzonCategoryPathMap(categoryTree);
    console.log(`[importFromOzon] Fetched ${ozonProducts.length} products from Ozon`);
    const userIds = await this.getEffectiveUserIds(userId);
    let imported = 0;
    let skipped = 0;
    let articlesUpdated = 0;
    const errors: string[] = [];
    const PROCESS_CONCURRENCY = 12;
    let processed = 0;
    const total = ozonProducts.length;
    const reportProgress = async () => {
      if (!options?.onProgress) return;
      const percent = total > 0 ? Math.round((processed / total) * 100) : 100;
      await options.onProgress({ processed, total, percent });
    };
    await reportProgress();
    const processProduct = async (p: (typeof ozonProducts)[number]) => {
      const ozonCategoryPath = (p.ozonCategoryId && p.ozonTypeId)
        ? categoryPathMap.get(`${p.ozonCategoryId}-${p.ozonTypeId}`)
        : undefined;
      // Матчинг: 1) по product_id в маппинге, 2) по offer_id в маппинге, 3) по артикулу (с учётом linked-аккаунтов)
      const existing =
        (await this.productMappingService.findProductByExternalIdForUserIds(userIds, 'OZON', String(p.productId))) ??
        (await this.productMappingService.findProductByExternalArticle(userIds, 'OZON', p.offerId)) ??
        (await this.productsService.findByArticleForUserIds(userIds, p.offerId));
      if (existing) {
        const updates: {
          article?: string; title?: string; description?: string; imageUrl?: string; imageUrls?: string[]; barcodeOzon?: string;
          weight?: number; width?: number; height?: number; length?: number;
          brand?: string; color?: string; ozonCategoryId?: number; ozonTypeId?: number; ozonCategoryPath?: string;
        } = {};
        const ex = existing as { weight?: number | null; width?: number | null; height?: number | null; length?: number | null; brand?: string | null; color?: string | null; ozonCategoryId?: number | null; ozonTypeId?: number | null; ozonCategoryPath?: string | null; imageUrls?: unknown };
        if (p.offerId && existing.article !== p.offerId) updates.article = p.offerId;
        if (p.name && existing.title !== p.name) updates.title = p.name.slice(0, 500);
        if (typeof p.description === 'string' && p.description.trim() && existing.description !== p.description.slice(0, 5000))
          updates.description = p.description.slice(0, 5000);
        if (p.imageUrl != null && existing.imageUrl !== p.imageUrl) updates.imageUrl = p.imageUrl;
        if (p.images && p.images.length > 1) {
          const additionalImages = p.images.slice(1);
          const existingAdditional = Array.isArray(ex.imageUrls) ? ex.imageUrls : [];
          if (JSON.stringify(existingAdditional) !== JSON.stringify(additionalImages))
            updates.imageUrls = additionalImages;
        }
        if (p.barcode != null && existing.barcodeOzon !== p.barcode) updates.barcodeOzon = p.barcode;
        if (p.weight != null && ex.weight !== p.weight) updates.weight = p.weight;
        if (p.width != null && ex.width !== p.width) updates.width = p.width;
        if (p.height != null && ex.height !== p.height) updates.height = p.height;
        if (p.length != null && ex.length !== p.length) updates.length = p.length;
        if (p.brand != null && ex.brand !== p.brand) updates.brand = p.brand;
        if (p.color != null && ex.color !== p.color) updates.color = p.color;
        if (p.ozonCategoryId != null && ex.ozonCategoryId !== p.ozonCategoryId) updates.ozonCategoryId = p.ozonCategoryId;
        if (p.ozonTypeId != null && ex.ozonTypeId !== p.ozonTypeId) updates.ozonTypeId = p.ozonTypeId;
        if (ozonCategoryPath != null && ex.ozonCategoryPath !== ozonCategoryPath) updates.ozonCategoryPath = ozonCategoryPath;
        if (Object.keys(updates).length > 0) {
          await this.prisma.product.update({
            where: { id: existing.id },
            data: updates,
          });
          articlesUpdated++;
        }
        await this.productMappingService.upsertMapping(existing.id, userId, 'OZON', String(p.productId), {
          externalArticle: p.offerId,
        });
        skipped++;
        return;
      }
      try {
        const title = (p.name || `Товар ${p.productId}`).trim().slice(0, 500);
        if (!title) return;
        const created = await this.productsService.create(userId, {
          title,
          description: p.description?.slice(0, 5000),
          cost: 0,
          imageUrl: p.imageUrl,
          imageUrls: p.images && p.images.length > 1 ? p.images.slice(1) : undefined,
          article: p.offerId,
          barcodeOzon: p.barcode,
          weight: p.weight,
          width: p.width,
          height: p.height,
          length: p.length,
          brand: p.brand,
          color: p.color,
          ozonCategoryId: p.ozonCategoryId,
          ozonTypeId: p.ozonTypeId,
          ozonCategoryPath,
        });
        await this.productMappingService.upsertMapping(created.id, userId, 'OZON', String(p.productId), {
          externalArticle: p.offerId,
        });
        imported++;
      } catch (err) {
        errors.push(`${p.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    for (let i = 0; i < ozonProducts.length; i += PROCESS_CONCURRENCY) {
      const chunk = ozonProducts.slice(i, i + PROCESS_CONCURRENCY);
      await Promise.all(chunk.map((p) => processProduct(p)));
      processed += chunk.length;
      await reportProgress();
    }

    if (imported > 0 || articlesUpdated > 0) {
      await this.prisma.marketplaceConnection.update({
        where: { id: conn.id },
        data: { lastSyncAt: new Date(), lastError: null },
      });
    }

    console.log(`[importFromOzon] Completed: imported=${imported}, skipped=${skipped}, articlesUpdated=${articlesUpdated}, errors=${errors.length}`);

    return { imported, skipped, articlesUpdated: articlesUpdated > 0 ? articlesUpdated : undefined, errors };
  }

  /**
   * For WB products that still have no imageUrl after import: attempt CDN formula.
   * NOTE: CDN formula is best-effort and may return 404 for high nmIds.
   * The primary source of photos is always WB Content API mediaFiles — this is
   * just a last-resort placeholder so the product isn't completely photo-less.
   * Called automatically at end of WB import and on products-page load.
   */
  async backfillWbPhotos(userId: string): Promise<void> {
    const mappings = await this.prisma.productMarketplaceMapping.findMany({
      where: { userId, marketplace: 'WILDBERRIES' },
      include: { product: { select: { id: true, imageUrl: true } } },
    });
    for (const m of mappings) {
      if (m.product.imageUrl) continue; // already has any photo — keep it
      const nmId = parseInt(m.externalSystemId, 10);
      if (isNaN(nmId) || nmId <= 0) continue;
      await this.prisma.product.update({
        where: { id: m.product.id },
        data: { imageUrl: WildberriesAdapter.wbCdnPhotoUrl(nmId) },
      });
    }
  }

  /**
   * Фоновое обновление кеша WB-предметов — 1-е число каждого месяца в 03:00.
   * Использует токен любого пользователя с подключённым WB.
   * Не бросает исключений — только логирует ошибку.
   */
  @Cron('0 3 1 * *', { name: 'wb-subjects-monthly-refresh' })
  async refreshWbSubjectsMonthly(): Promise<void> {
    const conn = await this.prisma.marketplaceConnection.findFirst({
      where: { marketplace: 'WILDBERRIES' },
      select: { userId: true },
    });
    if (!conn) {
      this.logger.debug('WB subjects refresh: no WB connections found, skipping.');
      return;
    }
    this.logger.log('WB subjects cache: starting monthly refresh...');
    await this.refreshWbSubjectCache(conn.userId).catch((err: unknown) =>
      this.logger.warn(`Monthly WB subject refresh failed: ${String(err)}`),
    );
    this.logger.log('WB subjects cache: monthly refresh complete.');
  }
}
