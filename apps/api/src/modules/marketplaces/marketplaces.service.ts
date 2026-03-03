import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
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
import { Prisma } from '@prisma/client';
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

@Injectable()
export class MarketplacesService {
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
    return merged.map((conn) => ({
      ...conn,
      token: undefined,
      refreshToken: undefined,
      statsToken: undefined,
      hasStatsToken: !!conn.statsToken,
    }));
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

      let productsToSync = await this.enrichProductsWithMarketplaceMappings(ids, products, conn.marketplace);

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
   * userIds: текущий userId + linkedToUserId (для привязанных аккаунтов). */
  private async enrichProductsWithMarketplaceMappings(
    userIds: string[],
    products: ProductData[],
    marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
  ): Promise<ProductData[]> {
    const mappings = await this.prisma.productMarketplaceMapping.findMany({
      where: { userId: { in: userIds }, marketplace, isActive: true, syncStock: true },
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
      if (!m) return p;
      const extId = m.externalSystemId;
      if (marketplace === 'WILDBERRIES') {
        const wbNmId = parseInt(extId, 10);
        return !isNaN(wbNmId) ? { ...p, wbNmId } : p;
      }
      if (marketplace === 'OZON') {
        const enriched = { ...p, ozonProductId: extId };
        enriched.vendorCode = m.externalArticle?.trim() || enriched.vendorCode;
        return enriched;
      }
      if (marketplace === 'YANDEX') return { ...p, yandexProductId: extId };
      if (marketplace === 'AVITO') return { ...p, avitoProductId: extId };
      return p;
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
   */
  async getOrdersStatsByMarketplace(
    userId: string,
    from?: Date,
    to?: Date,
  ): Promise<
    Record<
      string,
      { totalOrders: number; delivered: number; cancelled: number; revenue: number }
    >
  > {
    const ids = await this.getEffectiveUserIds(userId);
    const now = new Date();
    const fromDate = from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Отказы = «Покупатель отказался»: raw_status IN (WB/Ozon). Без raw_status — все CANCELLED (legacy).
    const rows = await this.prisma.$queryRaw<
      Array<{
        marketplace: string;
        total_orders: bigint;
        delivered_count: bigint;
        cancelled_count: bigint;
        revenue: string;
      }>
    >`
      SELECT 
        marketplace::text,
        COUNT(*)::bigint as total_orders,
        COUNT(*) FILTER (WHERE status = 'DELIVERED')::bigint as delivered_count,
        COUNT(*) FILTER (WHERE status = 'CANCELLED' AND (
          raw_status IS NULL
          OR LOWER(TRIM(raw_status)) IN ('canceled_by_client','declined_by_client','reject','rejected','cancelled_by_client','customer_refused')
        ))::bigint as cancelled_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'DELIVERED'), 0)::text as revenue
      FROM "Order"
      WHERE user_id IN (${Prisma.join(ids)})
        AND created_at >= ${fromDate}
        AND created_at <= ${toDate}
      GROUP BY marketplace
    `;

    const result: Record<string, { totalOrders: number; delivered: number; cancelled: number; revenue: number }> = {};
    for (const r of rows) {
      const key = r.marketplace.toLowerCase();
      result[key] = {
        totalOrders: Number(r.total_orders) || 0,
        delivered: Number(r.delivered_count) || 0,
        cancelled: Number(r.cancelled_count) || 0,
        revenue: Math.round(Number(r.revenue || 0) * 100) / 100,
      };
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
    const mappings = await this.prisma.productMarketplaceMapping.findMany({
      where: { userId: { in: ids }, isActive: true },
      select: { productId: true, marketplace: true },
    });
    for (const m of mappings) {
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
    const orderItems = await this.prisma.orderItem.findMany({
      where: { order: { userId: { in: ids } } },
      select: { productId: true, order: { select: { marketplace: true } } },
    });
    for (const item of orderItems) {
      if (!item.productId || !item.order?.marketplace) continue;
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

  /** Получить штрих-код WB по productId — для автозаполнения в карточке товара */
  async getWbBarcodeForProduct(userId: string, productId: string): Promise<{ barcode: string } | { error: string }> {
    const product = await this.productsService.findById(userId, productId);
    if (!product) {
      throw new BadRequestException('Товар не найден');
    }
    let nmId: number | null = await this.productMappingService.getWbNmId(product.id, userId);
    if (nmId == null) {
      const match = (product.sku ?? '').match(/^WB-[^-]+-(\d+)$/);
      nmId = match ? parseInt(match[1], 10) : null;
    }
    if (nmId == null) {
      return { error: 'Товар не привязан к WB (нет nm_id)' };
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
    // Цена задаётся клиентом на Ozon; при создании используем placeholder
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
   * Импорт товаров с маркетплейса в каталог. Поддерживается Wildberries и Ozon.
   */
  async importProductsFromMarketplace(
    userId: string,
    marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
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

    if (marketplace === 'OZON') {
      return this.importFromOzon(userId, conn, adapter);
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
        if (p.imageUrl != null && existing.imageUrl !== p.imageUrl) updates.imageUrl = p.imageUrl;
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
          imageUrl: p.imageUrl,
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

    return { imported, skipped, articlesUpdated: articlesUpdated > 0 ? articlesUpdated : undefined, errors };
  }

  /** Импорт товаров с Ozon */
  private async importFromOzon(
    userId: string,
    conn: { id: string },
    adapter: unknown,
  ): Promise<{ imported: number; skipped: number; articlesUpdated?: number; errors: string[] }> {
    if (!adapter || !(adapter instanceof OzonAdapter)) {
      throw new BadRequestException('Ошибка загрузки товаров с Ozon');
    }
    const ozonProducts = await withRetry(() => adapter.getProductsFromOzon(), 'getProductsFromOzon');
    let imported = 0;
    let skipped = 0;
    let articlesUpdated = 0;
    const errors: string[] = [];

    for (const p of ozonProducts) {
      const existing =
        (await this.productMappingService.findProductByExternalId(userId, 'OZON', String(p.productId))) ??
        (await this.productsService.findByArticle(userId, p.offerId));
      if (existing) {
        const updates: { article?: string; title?: string; description?: string; imageUrl?: string; barcodeOzon?: string; weight?: number; width?: number; height?: number; length?: number } = {};
        const ex = existing as { weight?: number | null; width?: number | null; height?: number | null; length?: number | null };
        if (p.offerId && existing.article !== p.offerId) updates.article = p.offerId;
        if (p.name && existing.title !== p.name) updates.title = p.name.slice(0, 500);
        if (typeof p.description === 'string' && p.description.trim() && existing.description !== p.description.slice(0, 5000))
          updates.description = p.description.slice(0, 5000);
        if (p.imageUrl != null && existing.imageUrl !== p.imageUrl) updates.imageUrl = p.imageUrl;
        if (p.barcode != null && existing.barcodeOzon !== p.barcode) updates.barcodeOzon = p.barcode;
        if (p.weight != null && ex.weight !== p.weight) updates.weight = p.weight;
        if (p.width != null && ex.width !== p.width) updates.width = p.width;
        if (p.height != null && ex.height !== p.height) updates.height = p.height;
        if (p.length != null && ex.length !== p.length) updates.length = p.length;
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
        continue;
      }
      try {
        const title = (p.name || `Товар ${p.productId}`).trim().slice(0, 500);
        if (!title) continue;
        const created = await this.productsService.create(userId, {
          title,
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

    return { imported, skipped, articlesUpdated: articlesUpdated > 0 ? articlesUpdated : undefined, errors };
  }
}
