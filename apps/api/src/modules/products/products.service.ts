import { Injectable, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { StockService } from './stock.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

export const STOCK_CHANGED_EVENT = 'stock.changed';
/** Событие для синхронизации с маркетплейсами (остаток или цена). */
export const PRODUCT_SYNC_CHANGED_EVENT = 'product.sync.changed';

export interface StockChangedPayload {
  userId: string;
  productId: string;
}

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
    private crypto: CryptoService,
    private subscriptionsService: SubscriptionsService,
    private eventEmitter: EventEmitter2,
  ) {}

  async findAll(userId: string, includeArchived = false) {
    return this.prisma.product.findMany({
      where: {
        userId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        marketplaceMappings: {
          where: { isActive: true },
          select: { marketplace: true, externalSystemId: true },
        },
      },
    });
  }

  /** Список только архивных товаров */
  async findArchived(userId: string) {
    return this.prisma.product.findMany({
      where: { userId, archivedAt: { not: null } },
      orderBy: { archivedAt: 'desc' },
      include: {
        marketplaceMappings: {
          where: { isActive: true },
          select: { marketplace: true, externalSystemId: true },
        },
      },
    });
  }

  async create(
    userId: string,
    data: {
      title: string;
      description?: string;
      price: number;
      article?: string;
      imageUrl?: string;
      sku?: string;
      brand?: string;
      barcodeOzon?: string;
      weight?: number;
      width?: number;
      length?: number;
      height?: number;
      productUrl?: string;
      color?: string;
      itemsPerPack?: number;
      material?: string;
      craftType?: string;
      countryOfOrigin?: string;
      packageContents?: string;
      richContent?: string;
      ozonCategoryId?: number;
      ozonTypeId?: number;
    },
  ) {
    const [limits, count] = await Promise.all([
      this.subscriptionsService.getLimits(userId),
      this.prisma.product.count({ where: { userId } }),
    ]);
    if (count >= limits.maxProducts) {
      throw new BadRequestException(
        `Достигнут лимит товаров (${limits.maxProducts}) по вашему тарифу. Перейдите на другой план в разделе «Подписка».`,
      );
    }
    return this.prisma.product.create({
      data: { ...data, userId, price: data.price },
    });
  }

  async findBySku(userId: string, sku: string) {
    return this.prisma.product.findFirst({
      where: { userId, sku },
    });
  }

  /** Поиск по окончанию sku (например WB-xxx-12345 → ищем *-12345) */
  async findBySkuSuffix(userId: string, suffix: string) {
    return this.prisma.product.findFirst({
      where: {
        userId,
        sku: { endsWith: suffix },
      },
    });
  }

  async findById(userId: string, id: string) {
    return this.prisma.product.findFirst({
      where: { userId, id },
    });
  }

  /** Товар с маппингами маркетплейсов (для карточки: barcode, externalSystemId) */
  async findByIdWithMappings(userId: string, id: string) {
    return this.prisma.product.findFirst({
      where: { userId, id },
      include: {
        marketplaceMappings: {
          select: { marketplace: true, externalSystemId: true, externalArticle: true },
        },
      },
    });
  }

  /** Товар с маппингами по UUID, displayId (0001) или артикулу (edc002) — для карточки и API */
  async findByIdWithMappingsByArticleOrId(userId: string, value: string) {
    const product = await this.findByArticleOrId(userId, value);
    if (!product) return null;
    return this.findByIdWithMappings(userId, product.id);
  }

  async findByArticle(userId: string, article: string) {
    return this.prisma.product.findFirst({
      where: { userId, article },
    });
  }

  /** Поиск по ID (0001, displayId), UUID или артикулу — для пополнения остатков */
  async findByArticleOrId(userId: string, value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Сквозной ID: 0001, 1, 2...
    const numId = parseInt(trimmed.replace(/^0+/, '') || '0', 10);
    if (!isNaN(numId) && numId > 0 && trimmed.replace(/^0+/, '') === String(numId)) {
      const byDisplay = await this.prisma.product.findFirst({
        where: { userId, displayId: numId },
      });
      if (byDisplay) return byDisplay;
    }
    // UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
    if (isUuid) {
      return this.findById(userId, trimmed);
    }
    return this.findByArticle(userId, trimmed);
  }

  /** Пополнение или списание остатков — атомарно через StockService.
   * StockService.change emits stock.changed для авто-синхронизации с маркетплейсами. */
  async replenish(
    userId: string,
    productIdOrArticle: string,
    delta: number,
    note?: string,
  ) {
    const product = await this.findByArticleOrId(userId, productIdOrArticle);
    if (!product) {
      throw new BadRequestException('Товар не найден. Проверьте ID или артикул.');
    }
    return this.stockService.change(product.id, userId, delta, {
      source: 'MANUAL' as const,
      note,
      allowNegative: false,
    });
  }

  /** Установить остаток (абсолютное значение). Используется для inline-редактирования.
   * productId: UUID или displayId (0006, 6). */
  async setStock(userId: string, productId: string, stock: number) {
    const product = await this.findByArticleOrId(userId, productId);
    if (!product) {
      throw new BadRequestException('Товар не найден.');
    }
    if (stock < 0) {
      throw new BadRequestException('Остаток не может быть отрицательным.');
    }
    const currentStock = product.stock ?? 0;
    const delta = stock - currentStock;
    if (delta === 0) return product;
    return this.stockService.change(product.id, userId, delta, {
      source: 'MANUAL',
      note: `Изменение через таблицу: ${currentStock} → ${stock}`,
      allowNegative: false,
    });
  }

  /** Архивировать товар (soft delete). productId: UUID, displayId или артикул */
  async archive(userId: string, productId: string) {
    const product = await this.findByArticleOrId(userId, productId);
    if (!product) {
      throw new BadRequestException('Товар не найден.');
    }
    if ((product as { archivedAt?: Date | null }).archivedAt) {
      throw new BadRequestException('Товар уже в архиве.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.changed_by', $1, true)`,
        userId,
      );
      await tx.product.update({
        where: { id: product.id },
        data: { archivedAt: new Date() },
      });
    });
    return { archived: true };
  }

  /** Восстановить товар из архива. productId: UUID, displayId или артикул */
  async restore(userId: string, productId: string) {
    const product = await this.findByArticleOrId(userId, productId);
    if (!product) {
      throw new BadRequestException('Товар не найден.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.changed_by', $1, true)`,
        userId,
      );
      await tx.product.update({
        where: { id: product.id },
        data: { archivedAt: null },
      });
    });
    return { restored: true };
  }

  /** Архивировать (alias для remove — обратная совместимость API) */
  async remove(userId: string, productId: string) {
    return this.archive(userId, productId);
  }

  /** История изменений остатков по товару. productId: UUID или displayId (0006). */
  async getStockHistory(userId: string, productId: string) {
    const product = await this.findByArticleOrId(userId, productId);
    if (!product) return [];
    const entries = await this.prisma.stockLog.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { name: true, email: true, emailEncrypted: true } } },
    });
    return entries.map((e) => ({
      ...e,
      user: e.user
        ? {
            name: this.crypto.decryptOptional(e.user.name) ?? e.user.name,
            email: e.user.emailEncrypted
              ? this.crypto.decryptOptional(e.user.emailEncrypted)
              : e.user.email,
          }
        : null,
    }));
  }

  /** Обновить поля товара. productId: UUID, displayId или артикул. История пишется через триггер product_change_trigger. */
  async update(
    userId: string,
    productIdOrArticle: string,
    data: {
      title?: string;
      price?: number;
      article?: string;
      description?: string;
      seoTitle?: string;
      seoKeywords?: string;
      seoDescription?: string;
      imageUrl?: string;
      barcodeWb?: string;
      barcodeOzon?: string;
      brand?: string;
      weight?: number;
      width?: number;
      length?: number;
      height?: number;
      productUrl?: string;
      color?: string;
      itemsPerPack?: number;
      material?: string;
      craftType?: string;
      countryOfOrigin?: string;
      packageContents?: string;
      richContent?: string;
      ozonCategoryId?: number;
      ozonTypeId?: number;
    },
  ) {
    const product = await this.findByArticleOrId(userId, productIdOrArticle);
    if (!product) {
      throw new BadRequestException('Товар не найден.');
    }
    const productId = product.id;
    const updates: Record<string, string | number | null | undefined> = {};
    const toStr = (v: unknown): string | null =>
      v === null || v === undefined ? null : String(v);

    const readOnlyFields = new Set(['barcodeWb', 'barcodeOzon']);
    for (const [field, value] of Object.entries(data)) {
      if (value === undefined || readOnlyFields.has(field)) continue;
      const current = (product as Record<string, unknown>)[field];
      let newVal: string | number | null = value as string | number | null;
      if (field === 'price') {
        const num = Number(value);
        if (isNaN(num) || num < 0) continue;
        newVal = num;
      }
      if (['weight', 'width', 'length', 'height', 'itemsPerPack', 'ozonCategoryId', 'ozonTypeId'].includes(field)) {
        const num = Number(value);
        if (isNaN(num)) continue;
        if (num < 0 && field !== 'ozonCategoryId' && field !== 'ozonTypeId') continue;
        newVal = num;
      }
      const oldStr = toStr(current);
      let normalizedNew: string | number | null = newVal;
      if (
        (field === 'article' ||
          field === 'description' ||
          field === 'seoTitle' ||
          field === 'seoKeywords' ||
          field === 'seoDescription' ||
          field === 'imageUrl' ||
          field === 'brand' ||
          field === 'productUrl' ||
          field === 'color' ||
          field === 'material' ||
          field === 'craftType' ||
          field === 'countryOfOrigin' ||
          field === 'packageContents' ||
          field === 'richContent' ||
          field === 'ozonCategoryPath') &&
        typeof newVal === 'string' &&
        newVal === ''
      ) {
        normalizedNew = null;
      }
      const newStr = toStr(normalizedNew);
      if (oldStr !== newStr) {
        updates[field] = normalizedNew;
      }
    }
    if (Object.keys(updates).length === 0) return product;
    // Синхронизация на маркеты при изменении любых полей карточки (описание, название, цена, габариты и т.д.)
    const syncRelevantFields = new Set([
      'title', 'description', 'price', 'imageUrl', 'brand', 'weight', 'width', 'length', 'height',
      'color', 'material', 'craftType', 'countryOfOrigin', 'packageContents', 'richContent',
      'itemsPerPack', 'ozonCategoryId', 'ozonTypeId', 'seoTitle', 'seoKeywords', 'seoDescription',
    ]);
    const shouldSyncToMarketplaces = Object.keys(updates).some((k) => syncRelevantFields.has(k));
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.changed_by', $1, true)`,
        userId,
      );
      return tx.product.update({
        where: { id: productId },
        data: { ...updates },
      });
    });
    if (shouldSyncToMarketplaces) {
      this.eventEmitter.emit(PRODUCT_SYNC_CHANGED_EVENT, { userId, productId } as StockChangedPayload);
    }
    return updated;
  }

  /** Объединённая история: product_change_log (триггер) + legacy StockLog/ProductFieldLog.
   * productId: UUID или displayId (0006, 6). */
  async getProductHistory(userId: string, productId: string) {
    const product = await this.findByArticleOrId(userId, productId);
    if (!product) return [];
    const id = product.id;
    const mapUser = (u: { name: string | null; email?: string | null; emailEncrypted?: string | null } | null) =>
      u
        ? {
            name: this.crypto.decryptOptional(u.name) ?? u.name,
            email: u.emailEncrypted ? this.crypto.decryptOptional(u.emailEncrypted) : u.email,
          }
        : null;

    const [changeEntries, stockEntries, fieldEntries] = await Promise.all([
      this.prisma.productChangeLog.findMany({
        where: { productId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { user: { select: { name: true, email: true, emailEncrypted: true } } },
      }),
      this.prisma.stockLog.findMany({
        where: { productId: id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { user: { select: { name: true, email: true, emailEncrypted: true } } },
      }),
      this.prisma.productFieldLog
        .findMany({
          where: { productId: id },
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: { user: { select: { name: true, email: true, emailEncrypted: true } } },
        })
        .catch(() => []),
    ]);

    const fromChange = changeEntries.map((e) => {
      const type =
        e.changeType === 'STOCK'
          ? 'stock'
          : e.changeType === 'ARCHIVE' || e.changeType === 'RESTORE'
            ? 'field'
            : 'field';
      if (type === 'stock') {
        const oldV = e.oldValue ? parseInt(e.oldValue, 10) : 0;
        const newV = e.newValue ? parseInt(e.newValue, 10) : 0;
        return {
          type: 'stock' as const,
          id: e.id,
          delta: e.delta ?? newV - oldV,
          quantityBefore: oldV,
          quantityAfter: newV,
          source: e.source ?? 'MANUAL',
          note: e.note,
          createdAt: e.createdAt,
          user: mapUser(e.user),
        };
      }
      const displayVal =
        e.changeType === 'ARCHIVE'
          ? 'В архив'
          : e.changeType === 'RESTORE'
            ? 'Восстановлен'
            : e.newValue;
      return {
        type: 'field' as const,
        id: e.id,
        field: e.fieldName ?? '',
        oldValue: e.oldValue,
        newValue: displayVal,
        createdAt: e.createdAt,
        user: mapUser(e.user),
      };
    });

    const fromStock = stockEntries.map((e) => ({
      type: 'stock' as const,
      id: e.id,
      delta: e.delta,
      quantityBefore: e.quantityBefore,
      quantityAfter: e.quantityAfter,
      source: e.source,
      note: e.note,
      createdAt: e.createdAt,
      user: mapUser(e.user),
    }));
    const fromField = fieldEntries.map((e) => ({
      type: 'field' as const,
      id: e.id,
      field: e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      createdAt: e.createdAt,
      user: mapUser(e.user),
    }));

    const seen = new Set<string>();
    const merged = [...fromChange];
    for (const e of [...fromStock, ...fromField]) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        merged.push(e);
      }
    }
    return merged.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
}
