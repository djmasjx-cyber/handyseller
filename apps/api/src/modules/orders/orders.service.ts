import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { MarketplacesService } from '../marketplaces/marketplaces.service';
import { ProductMappingService } from '../marketplaces/product-mapping.service';
import { ProductsService } from '../products/products.service';
import { StockService } from '../products/stock.service';
import { OrderStatus } from '@prisma/client';
import type { MarketplaceType } from '@prisma/client';

/** Маппинг статусов WB, Ozon, Яндекс → единый OrderStatus */
const MARKETPLACE_STATUS_TO_ORDER: Record<string, OrderStatus> = {
  // WB: new, confirm(ed), complete, deliver, sorted, shipped, ready_for_pickup, sold, receive, delivered, cancelled
  new: OrderStatus.NEW,
  confirm: OrderStatus.IN_PROGRESS,
  confirmed: OrderStatus.IN_PROGRESS,
  complete: OrderStatus.SHIPPED, // сдан в доставку (после «Сдать в доставку»)
  deliver: OrderStatus.SHIPPED,   // сдан в доставку (альтернативное название WB)
  sorted: OrderStatus.SHIPPED,   // WB отсортировало, в пути
  shipped: OrderStatus.SHIPPED,
  ready_for_pickup: OrderStatus.READY_FOR_PICKUP, // товар в ПВЗ, ждёт клиента
  waiting: OrderStatus.READY_FOR_PICKUP,
  sold: OrderStatus.DELIVERED,   // получен клиентом (выкуплен)
  receive: OrderStatus.DELIVERED,
  delivered: OrderStatus.DELIVERED,
  cancelled: OrderStatus.CANCELLED,
  canceled: OrderStatus.CANCELLED,
  cancel: OrderStatus.CANCELLED,
  reject: OrderStatus.CANCELLED,
  rejected: OrderStatus.CANCELLED,
  // Ozon: awaiting_packaging, awaiting_deliver, delivering, cancelled_by_client (отказ покупателя)
  awaiting_packaging: OrderStatus.NEW,
  awaiting_packaging_cancelled: OrderStatus.CANCELLED,
  awaiting_deliver: OrderStatus.IN_PROGRESS,
  delivering: OrderStatus.SHIPPED,
  cancelled_by_seller: OrderStatus.CANCELLED,
  cancelled_by_client: OrderStatus.CANCELLED,
  // Яндекс Маркет: PROCESSING, DELIVERY, PICKUP, DELIVERED, CANCELLED
  processing: OrderStatus.NEW,
  delivery: OrderStatus.SHIPPED,
  pickup: OrderStatus.SHIPPED,
};

/** Холд для NEW: 1 час — клиент может отменить без последствий. Резерв и переход в «На сборке» — после холда. */
const HOLD_MINUTES = 60;

/** Порядок статусов: только движение вперёд. CANCELLED — отдельный выход. */
const STATUS_RANK: Record<OrderStatus, number> = {
  [OrderStatus.NEW]: 0,
  [OrderStatus.IN_PROGRESS]: 1,
  [OrderStatus.SHIPPED]: 2,
  [OrderStatus.READY_FOR_PICKUP]: 3, // товар в ПВЗ, ждёт клиента
  [OrderStatus.DELIVERED]: 4,         // получен клиентом
  [OrderStatus.CANCELLED]: -1,
};

/** Выбирает итоговый статус: не понижаем по жизненному циклу, отмена — всегда применяется */
function pickResolvedStatus(existing: OrderStatus, fromApi: OrderStatus): OrderStatus {
  if (fromApi === OrderStatus.CANCELLED) return OrderStatus.CANCELLED;
  if (existing === OrderStatus.CANCELLED) return existing;
  return STATUS_RANK[fromApi] > STATUS_RANK[existing] ? fromApi : existing;
}

/** supplierStatus: «сдача в пункт приема» — продавец передал в доставку (отсканирован) */
const WB_HANDED_OVER_SUPPLIER_STATUSES = new Set(['complete', 'deliver']);
/** wbStatus fallback: WB отсортировало = принят на склад */
const WB_SORTED_RAW_STATUSES = new Set(['sorted']);

function isWbHandedOverAtAcceptancePoint(
  rawSupplierStatus: string | undefined | null,
  rawStatus: string | undefined | null,
): boolean {
  if (rawSupplierStatus != null && WB_HANDED_OVER_SUPPLIER_STATUSES.has(rawSupplierStatus.toLowerCase())) {
    return true;
  }
  return rawStatus != null && WB_SORTED_RAW_STATUSES.has(rawStatus.toLowerCase());
}

function isRawStatusHandedOver(raw: string | undefined | null): boolean {
  if (raw == null || raw.trim() === '') return false;
  const s = raw.toLowerCase().trim();
  return WB_HANDED_OVER_SUPPLIER_STATUSES.has(s) || WB_SORTED_RAW_STATUSES.has(s);
}

/** Время обработки (мин) = разница «создан» → «сдача в ПВЗ». Оценка: момент синка как proxy */
function calcProcessingTimeMin(createdAt: Date, deliveredAtProxy: Date = new Date()): number {
  const mins = (deliveredAtProxy.getTime() - createdAt.getTime()) / (60 * 1000);
  return Math.round(Math.max(0, mins));
}

/** Макс. надёжный интервал для sync_proxy: если > 72ч, оценка ненадёжна (заказ мог быть сдан давно) */
const MAX_TRUSTED_PROCESSING_MIN = 72 * 60;

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private marketplacesService: MarketplacesService,
    private productMappingService: ProductMappingService,
    private productsService: ProductsService,
    private stockService: StockService,
  ) {}

  /** Сводка по заказам (чистый read, без side effects).
   * newCount = заказы status=NEW, не сданные (raw_status ∉ complete/sorted/deliver).
   * Источник истины — sync; читаем то, что sync записал. */
  async getOrderStats(userId: string): Promise<{ newCount: number; inProgressCount: number }> {
    const [inProgressCount, newOrders] = await Promise.all([
      this.prisma.order.count({ where: { userId, status: OrderStatus.IN_PROGRESS } }),
      this.prisma.order.findMany({
        where: { userId, status: OrderStatus.NEW },
        select: { rawStatus: true },
      }),
    ]);
    const excluded = newOrders.filter((o) =>
      isRawStatusHandedOver(o.rawStatus),
    ).length;
    const newCount = Math.max(0, newOrders.length - excluded);
    return { newCount, inProgressCount };
  }

  async findAll(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: {
        items: { include: { product: true } },
        processingTime: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => {
      const fromTable = o.processingTime?.processingTimeMin;
      const fromLegacy = o.processingTimeMin;
      const val = fromTable ?? (fromLegacy != null && fromLegacy <= MAX_TRUSTED_PROCESSING_MIN ? fromLegacy : null);
      return { ...o, processingTimeMin: val };
    });
  }

  /** Получить стикер заказа WB (PNG base64) для печати этикетки заказа */
  async getWbStickerImage(userId: string, orderId: string): Promise<{ file: string } | { error: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { marketplace: true, wbStickerNumber: true },
    });
    if (!order) {
      return { error: 'Заказ не найден' };
    }
    if (order.marketplace !== 'WILDBERRIES') {
      return { error: 'Стикер доступен только для заказов Wildberries' };
    }
    if (!order.wbStickerNumber) {
      return { error: 'Запустите синхронизацию заказов для получения номера стикера' };
    }
    return this.marketplacesService.getWbOrderSticker(userId, order.wbStickerNumber);
  }

  /** Отладка: проверить статус заказа на WB (например 4645532575) */
  async getWbOrderStatusDebug(userId: string, orderIdOrSrid: string) {
    return this.marketplacesService.getWbOrderStatus(userId, orderIdOrSrid);
  }

  /** Отладка: получить сырые заказы с WB без сохранения */
  async getRawOrdersFromWb(userId: string) {
    const orders = await this.marketplacesService.getOrdersFromAllMarketplaces(userId, new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));
    const products = await this.prisma.product.findMany({
      where: { userId },
      select: { id: true, sku: true, article: true },
    });
    return {
      ordersFromWb: orders,
      productsCount: products.length,
      productSamples: products.slice(0, 10),
    };
  }

  /** Обновление статуса заказа. NEW → IN_PROGRESS только после истечения холда (30 мин) и при положительном остатке. */
  async updateStatus(userId: string, orderId: string, status: OrderStatus) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: { include: { product: { select: { id: true, stock: true, title: true, article: true } } } } },
    });
    if (!order) return null;

    if (order.status === OrderStatus.NEW && status === OrderStatus.IN_PROGRESS) {
      const now = new Date();
      const holdUntil = order.holdUntil;
      if (holdUntil && now < holdUntil) {
        throw new BadRequestException(
          `Заказ в холде до ${holdUntil.toLocaleTimeString('ru-RU')}. Клиент может отменить в течение ${HOLD_MINUTES} мин. Переход в «На сборке» — автоматически после холда.`,
        );
      }
      // Проверка остатка: все позиции должны иметь stock >= quantity
      for (const item of order.items) {
        const stock = item.product?.stock ?? 0;
        if (stock < item.quantity) {
          const name = item.product?.title || item.product?.article || 'Товар';
          throw new BadRequestException(
            `Недостаточно остатка для «${name}»: нужно ${item.quantity}, в наличии ${stock}.`,
          );
        }
      }
    }

    // Сначала передаём статус на маркетплейс — при ошибке пользователь получит сообщение
    if (order.status === OrderStatus.NEW && status === OrderStatus.IN_PROGRESS) {
      await this.marketplacesService.pushOrderStatus(userId, order.marketplace, {
        marketplaceOrderId: order.externalId,
        status: status, // IN_PROGRESS → адаптеры маппят в CONFIRMED/awaiting_deliver и т.д.
        wbStickerNumber: order.wbStickerNumber ?? undefined,
        wbFulfillmentType: order.marketplace === 'WILDBERRIES' ? (order as { wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW' | null }).wbFulfillmentType ?? undefined : undefined,
      });
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });
    return updated;
  }

  /**
   * Повторное резервирование остатка для заказа по externalId/orderId (для админа, без проверки userId).
   */
  async retryStockReserveByExternalId(orderIdOrExternalId: string): Promise<{ ok: boolean; reserved: number; message?: string }> {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id: orderIdOrExternalId }, { externalId: orderIdOrExternalId }],
      },
      select: { userId: true },
    });
    if (!order) return { ok: false, reserved: 0, message: 'Заказ не найден' };
    return this.retryStockReserve(order.userId, orderIdOrExternalId);
  }

  /**
   * Повторное резервирование остатка для заказа (если не было резерва при создании).
   * Списывает остаток и отправляет на WB/Ozon через StockSyncListener.
   */
  async retryStockReserve(userId: string, orderIdOrExternalId: string): Promise<{ ok: boolean; reserved: number; message?: string }> {
    const order = await this.prisma.order.findFirst({
      where: {
        userId,
        OR: [
          { id: orderIdOrExternalId },
          { externalId: orderIdOrExternalId },
        ],
      },
      include: { items: { include: { product: { select: { id: true, userId: true } } } } },
    });
    if (!order) return { ok: false, reserved: 0, message: 'Заказ не найден' };
    if (order.status === OrderStatus.CANCELLED) {
      return { ok: false, reserved: 0, message: 'Заказ отменён, резерв не нужен' };
    }
    let reserved = 0;
    for (const item of order.items) {
      if (!item.product) continue;
      const alreadyReserved = await this.prisma.stockLog.findFirst({
        where: {
          productId: item.productId,
          source: 'SALE',
          note: { contains: `Заказ ${order.externalId}` },
        },
      });
      if (!alreadyReserved) {
        await this.stockService.reserve(item.productId, item.product.userId, item.quantity, {
          source: 'SALE' as const,
          note: `Заказ ${order.externalId} (${order.marketplace})`,
          allowNegative: true,
        });
        reserved++;
      }
    }
    return { ok: true, reserved };
  }

  /**
   * Повторная отправка статуса на WB (для заказов, у которых смена статуса не дошла до WB).
   * Вызывать для WB-заказов в статусе IN_PROGRESS, если на WB заказ всё ещё «Новый».
   */
  async retryPushOrderStatus(userId: string, orderId: string): Promise<{ ok: boolean; message?: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) return { ok: false, message: 'Заказ не найден' };
    if (order.marketplace !== 'WILDBERRIES') {
      return { ok: false, message: 'Повторная отправка поддерживается только для заказов WB' };
    }
    if (order.status !== OrderStatus.IN_PROGRESS) {
      return { ok: false, message: 'Повторная отправка только для заказов в статусе «На сборке»' };
    }
    try {
      await this.marketplacesService.pushOrderStatus(userId, order.marketplace, {
        marketplaceOrderId: order.externalId,
        status: order.status,
        wbStickerNumber: order.wbStickerNumber ?? undefined,
        wbFulfillmentType: (order as { wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW' | null }).wbFulfillmentType ?? undefined,
      });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg };
    }
  }

  /**
   * Автоматический переход NEW → IN_PROGRESS после истечения холда.
   * Условия: holdUntil <= now, положительный остаток по всем позициям.
   * Резервирует остаток, отправляет статус на маркетплейс, обновляет заказ.
   */
  async processHoldExpiredOrders(userId?: string): Promise<{ processed: number; skipped: number; errors: string[] }> {
    const now = new Date();
    const where: { status: typeof OrderStatus.NEW; holdUntil: { lte: Date }; userId?: string } = {
      status: OrderStatus.NEW,
      holdUntil: { lte: now }, // null не пройдёт (null <= now даёт false в SQL)
    };
    if (userId) where.userId = userId;

    const orders = await this.prisma.order.findMany({
      where: where as object,
      include: { items: { include: { product: { select: { id: true, userId: true, stock: true, title: true, article: true } } } } },
      orderBy: { holdUntil: 'asc' },
    });

    let processed = 0;
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const order of orders) {
      const uid = order.userId;
      const externalId = order.externalId;

      // Проверка остатка: все позиции должны иметь stock >= quantity
      let canProcess = true;
      for (const item of order.items) {
        const stock = item.product?.stock ?? 0;
        if (stock < item.quantity) {
          canProcess = false;
          const name = item.product?.title || item.product?.article || 'Товар';
          errors.push(`Заказ ${externalId}: недостаточно «${name}» (нужно ${item.quantity}, в наличии ${stock})`);
          break;
        }
      }
      if (!canProcess) {
        skipped.push(externalId);
        continue;
      }

      try {
        // 1. Резервируем остаток (StockSyncListener отправит -1 на маркеты)
        for (const item of order.items) {
          if (!item.product) continue;
          await this.stockService.reserve(item.productId, item.product.userId, item.quantity, {
            source: 'SALE' as const,
            note: `Заказ ${externalId} (${order.marketplace}) — авто после холда`,
            allowNegative: false,
          });
        }
        // 2. Отправляем статус на маркетплейс
        await this.marketplacesService.pushOrderStatus(uid, order.marketplace, {
          marketplaceOrderId: order.externalId,
          status: OrderStatus.IN_PROGRESS,
          wbStickerNumber: order.wbStickerNumber ?? undefined,
          wbFulfillmentType: order.marketplace === 'WILDBERRIES' ? (order as { wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW' }).wbFulfillmentType ?? undefined : undefined,
        });
        // 3. Обновляем статус заказа
        await this.prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.IN_PROGRESS },
        });
        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Заказ ${externalId}: ${msg}`);
        skipped.push(externalId);
      }
    }

    return { processed, skipped: skipped.length, errors };
  }

  /**
   * Синхронизация заказов с маркетплейсов в БД с идемпотентностью.
   * Повторная доставка того же заказа (retry) не создаст дубликат и не спишет остаток повторно.
   */
  async syncFromMarketplaces(userId: string, since?: Date): Promise<{ synced: number; skipped: number; errors: string[] }> {
    const sinceDate = since ?? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const orders = await this.marketplacesService.getOrdersFromAllMarketplaces(userId, sinceDate);
    let synced = 0;
    const skipped: string[] = [];
    const errors: string[] = [];
    /** externalId заказов, которые мы обработали в этой синхронизации */
    const processedThisRun = new Set<string>();

    for (const od of orders) {
      const marketplace = (od.marketplace ?? 'WILDBERRIES') as MarketplaceType;
      const externalId = od.marketplaceOrderId;
      const quantity = od.quantity ?? 1;

      const existing = await this.prisma.order.findUnique({
        where: {
          userId_marketplace_externalId: { userId, marketplace, externalId },
        },
        include: { items: true, processingTime: true },
      });

      // WB: приоритет rawStatus (wbStatus) из API статусов — точнее, чем orderStatus из списка заказов
      const statusForMapping =
        od.rawStatus ?? od.rawSupplierStatus ?? od.status;
      const newStatus = this.mapStatus(statusForMapping);
      const isCancelled = newStatus === OrderStatus.CANCELLED;

      if (existing) {
        // Идемпотентность: заказ уже есть — проверяем отмену, обновляем склад/статус/дату WB
        const updateData: {
          status?: OrderStatus;
          warehouseName?: string | null;
          rawStatus?: string | null;
          createdAt?: Date;
          wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW' | null;
        } = {};
        if (od.createdAt) updateData.createdAt = od.createdAt;
        if (existing.status !== OrderStatus.CANCELLED && isCancelled) {
          try {
            // Резерв делается только при переходе NEW→IN_PROGRESS. Release — только если заказ был на сборке.
            if (existing.status === OrderStatus.IN_PROGRESS) {
              for (const item of existing.items) {
                await this.stockService.release(item.productId, userId, item.quantity, {
                  source: 'SALE' as const,
                  note: `Отмена заказа ${externalId} (${marketplace})`,
                });
              }
            }
            updateData.status = OrderStatus.CANCELLED;
          } catch (err) {
            errors.push(`Отмена ${externalId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        // Синхронизация статуса: только при наличии rawStatus/rawSupplierStatus (fetchStatuses).
        // Единое правило — статус только вперёд (pickResolvedStatus), без понижения.
        const hasFreshStatus = od.rawStatus != null || od.rawSupplierStatus != null;
        if (hasFreshStatus) {
          const resolved = pickResolvedStatus(existing.status, newStatus);
          if (resolved !== existing.status) updateData.status = resolved;
        }
        if (od.warehouseName != null || od.rawStatus != null) {
          if (od.warehouseName != null) updateData.warehouseName = od.warehouseName;
          if (od.rawStatus != null) updateData.rawStatus = od.rawStatus;
        }
        if (od.rawSupplierStatus != null && !updateData.rawStatus) {
          (updateData as { rawStatus?: string }).rawStatus = od.rawSupplierStatus;
        }
        // Backfill/исправление этикетки WB: нужен id (числовой), не srid
        if (marketplace === 'WILDBERRIES') {
          const needFix =
            existing.wbStickerNumber == null || existing.wbStickerNumber === existing.externalId;
          if (needFix) (updateData as Record<string, unknown>).wbStickerNumber = od.id;
          if (od.wbFulfillmentType && existing.marketplace === 'WILDBERRIES') {
            updateData.wbFulfillmentType = od.wbFulfillmentType;
          }
        }
        if (existing.ozonPostingNumber == null && marketplace === 'OZON') {
          (updateData as Record<string, unknown>).ozonPostingNumber = externalId;
        }
        if (Object.keys(updateData).length > 0) {
          await this.prisma.order.update({
            where: { id: existing.id },
            data: updateData,
          });
        }
        // Время обработки: только при переходе в «сдан», только если ещё нет записи. Валидация: >72ч = ненадёжно
        if (
          isWbHandedOverAtAcceptancePoint(od.rawSupplierStatus, od.rawStatus) &&
          !existing.processingTime &&
          existing.createdAt
        ) {
          const mins = calcProcessingTimeMin(existing.createdAt);
          if (mins <= MAX_TRUSTED_PROCESSING_MIN) {
            await this.prisma.orderProcessingTime.upsert({
              where: { orderId: existing.id },
              create: { orderId: existing.id, processingTimeMin: mins, source: 'sync_proxy' },
              update: {},
            });
          }
        }
        processedThisRun.add(externalId);
        skipped.push(externalId);
        continue;
      }

      try {
        // Маппинг товара маркета → наш Product (WB: sku = WB-{userId8}-{nmId})
        const product = await this.findProductByMarketplaceId(userId, marketplace, od.productId);
        if (!product) {
          errors.push(`Заказ ${externalId}: товар ${od.productId} не найден в каталоге`);
          continue;
        }

        const status = this.mapStatus(od.status);
        const amount = od.amount ?? 0;
        const holdUntil =
          status === OrderStatus.NEW
            ? new Date(Date.now() + HOLD_MINUTES * 60 * 1000)
            : undefined;

        // Штрих-коды товара и этикетки заказа для печати
        const productWithBarcodes = await this.prisma.product.findUnique({
          where: { id: product.id },
          select: { barcodeWb: true, barcodeOzon: true },
        });
        const productBarcodeWb = productWithBarcodes?.barcodeWb ?? null;
        const productBarcodeOzon = productWithBarcodes?.barcodeOzon ?? null;
        // WB: номер стикера = id заказа (числовой), не srid/externalId. Нужен для /api/v3/orders/stickers
        const wbStickerNumber = marketplace === 'WILDBERRIES' ? od.id : null;
        const ozonPostingNumber = marketplace === 'OZON' ? externalId : null;

        // При создании НЕ пишем время обработки: заказы из «completed» API — момент сдачи неизвестен
        const order = await this.prisma.$transaction(async (tx) => {
          const o = await tx.order.create({
            data: {
              userId,
              marketplace,
              externalId,
              status,
              totalAmount: amount,
              holdUntil,
              warehouseName: od.warehouseName ?? null,
              rawStatus: od.rawStatus ?? null,
              createdAt: od.createdAt,
              wbStickerNumber,
              ozonPostingNumber,
              wbFulfillmentType:
                marketplace === 'WILDBERRIES' && (od as { wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW' }).wbFulfillmentType
                  ? (od as { wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW' }).wbFulfillmentType!
                  : null,
            },
          });
          await tx.orderItem.create({
            data: {
              orderId: o.id,
              productId: product.id,
              quantity,
              price: amount / quantity,
              productBarcodeWb,
              productBarcodeOzon,
            },
          });
          return o;
        });

        // Резерв при создании — только для заказов не в холде (IN_PROGRESS и выше). NEW — резерв после холда (cron).
        if (status !== OrderStatus.NEW) {
          await this.stockService.reserve(product.id, product.userId, quantity, {
            source: 'SALE' as const,
            note: `Заказ ${externalId} (${marketplace})`,
            allowNegative: true,
          });
        }
        processedThisRun.add(externalId);
        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Заказ ${externalId}: ${msg}`);
      }
    }

    // Backfill WB: обновляем статус заказов, которые не попали в getOrders или нуждаются в актуализации.
    // Окно 90 дней — старые заказы тоже получают актуальный статус (ready_for_pickup, sold и т.д.)
    const refreshSinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const processedList = Array.from(processedThisRun);
    const wbOrdersToRefresh = await this.prisma.order.findMany({
      where: {
        userId,
        marketplace: 'WILDBERRIES',
        status: { not: OrderStatus.CANCELLED },
        createdAt: { gte: refreshSinceDate },
        OR: [
          { externalId: processedList.length ? { notIn: processedList } : { not: '__impossible__' } },
          { status: OrderStatus.NEW, OR: [{ rawStatus: null }, { rawStatus: '' }] },
          { status: OrderStatus.IN_PROGRESS }, // после «Сдать в доставку» WB → complete
          { status: OrderStatus.SHIPPED },    // WB → ready_for_pickup
          { status: OrderStatus.READY_FOR_PICKUP }, // WB → sold/receive
        ],
      },
      select: { id: true, externalId: true, wbStickerNumber: true, status: true, rawStatus: true },
      take: 120,
    });
    for (const ord of wbOrdersToRefresh) {
      const idToCheck = ord.wbStickerNumber ?? ord.externalId;
      if (!idToCheck) continue;
      try {
        const res = await this.marketplacesService.getWbOrderStatus(userId, idToCheck);
        const wb = (res as { wb?: { supplierStatus?: string; wbStatus?: string; found?: boolean } }).wb;
        if (!wb?.found) continue;
        // wbStatus — текущее состояние WB (ready_for_pickup, sold); supplierStatus — действие продавца (complete)
        const statusFromWb = (wb.wbStatus ?? wb.supplierStatus ?? '').trim();
        if (!statusFromWb) continue;
        const newStatus = this.mapStatus(statusFromWb);
        const rawMatch = (ord.rawStatus ?? '').toLowerCase() === statusFromWb.toLowerCase();
        const needsUpdate = newStatus !== ord.status || !rawMatch;
        if (needsUpdate) {
          await this.prisma.order.update({
            where: { id: ord.id },
            data: { status: newStatus, rawStatus: statusFromWb },
          });
        }
      } catch {
        /* тихо пропускаем */
      }
    }

    // Post-sync: reconcile — raw_status обновился на WB, но status у нас отстал (NEW/IN_PROGRESS/SHIPPED)
    const toReconcile = await this.prisma.order.findMany({
      where: {
        userId,
        marketplace: 'WILDBERRIES',
        status: { in: [OrderStatus.NEW, OrderStatus.IN_PROGRESS, OrderStatus.SHIPPED, OrderStatus.READY_FOR_PICKUP] },
        rawStatus: { not: null },
      },
      select: { id: true, status: true, rawStatus: true },
    });
    for (const o of toReconcile) {
      const targetStatus = this.mapStatus(o.rawStatus!);
      if (targetStatus === OrderStatus.CANCELLED) continue;
      if (STATUS_RANK[targetStatus] > STATUS_RANK[o.status]) {
        await this.prisma.order.update({
          where: { id: o.id },
          data: { status: targetStatus },
        });
      }
    }

    return { synced, skipped: skipped.length, errors };
  }

  private mapStatus(status: string | number): OrderStatus {
    if (typeof status === 'number') {
      const numMap: Record<number, OrderStatus> = {
        0: OrderStatus.NEW,
        1: OrderStatus.NEW,
        2: OrderStatus.IN_PROGRESS,
        3: OrderStatus.SHIPPED,
        4: OrderStatus.DELIVERED,
        5: OrderStatus.CANCELLED,
      };
      return numMap[status] ?? OrderStatus.NEW;
    }
    const key = (status || '').toLowerCase().replace(/\s/g, '');
    return MARKETPLACE_STATUS_TO_ORDER[key] ?? OrderStatus.NEW;
  }

  /** Поиск Product по системному ID маркетплейса. Связка через mapping, fallback на sku. */
  private async findProductByMarketplaceId(
    userId: string,
    marketplace: MarketplaceType,
    marketplaceProductId: string,
  ) {
    // 1. Сначала — маппинг по системному ID (надёжно)
    const product = await this.productMappingService.findProductByExternalId(
      userId,
      marketplace,
      String(marketplaceProductId),
    );
    if (product) return product;

    // 2. Fallback на legacy sku (WB: WB-xxx-nmId)
    if (marketplace === 'WILDBERRIES') {
      const sku = `WB-${userId.slice(0, 8)}-${marketplaceProductId}`;
      const bySku = await this.productsService.findBySku(userId, sku);
      if (bySku) return bySku;
      const bySuffix = await this.productsService.findBySkuSuffix(userId, `-${marketplaceProductId}`);
      if (bySuffix) return bySuffix;
      return (await this.productsService.findByArticle(userId, marketplaceProductId)) ?? null;
    }

    // 3. Fallback для Ozon: по product_id получить offer_id, найти по артикулу, создать связку
    if (marketplace === 'OZON') {
      const offerId = await this.marketplacesService.getOzonOfferIdByProductId(userId, marketplaceProductId);
      if (offerId) {
        const byArticle = await this.productsService.findByArticle(userId, offerId);
        if (byArticle) {
          await this.productMappingService.upsertMapping(byArticle.id, userId, 'OZON', marketplaceProductId, {
            externalArticle: offerId,
          });
          return byArticle;
        }
      }
    }
    return null;
  }
}
