import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { MarketplacesService } from '../marketplaces/marketplaces.service';
import { ProductMappingService } from '../marketplaces/product-mapping.service';
import { ProductsService } from '../products/products.service';
import { StockService } from '../products/stock.service';
import { SalesSourcesService } from '../sales-sources/sales-sources.service';
import { OrderStatus, OrderCancellationKind, type Prisma } from '@prisma/client';
import type { MarketplaceType } from '@prisma/client';
import type { CreateManualOrderDto } from './dto/create-manual-order.dto';

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
  waiting: OrderStatus.IN_PROGRESS, // WB может возвращать "waiting" для заказов, ожидающих подтверждения продавцом
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
  // Ozon: сценарии клиентского отказа/невыкупа после отправки
  client_not_come: OrderStatus.CANCELLED,
  client_refused: OrderStatus.CANCELLED,
  not_accepted: OrderStatus.CANCELLED,
  not_accepted_by_client: OrderStatus.CANCELLED,
  cancelled_after_ship: OrderStatus.CANCELLED,
  cancelled_after_shipment: OrderStatus.CANCELLED,
  // WB возвращает canceled_by_client (амер. орфография) — «Клиент отказался»
  canceled_by_seller: OrderStatus.CANCELLED,
  canceled_by_client: OrderStatus.CANCELLED,
  declined_by_client: OrderStatus.CANCELLED,
  customer_refused: OrderStatus.CANCELLED,
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

function isDeliveryLifecycleStatus(status: OrderStatus): boolean {
  return (
    status === OrderStatus.SHIPPED ||
    status === OrderStatus.READY_FOR_PICKUP ||
    status === OrderStatus.DELIVERED
  );
}

function hasDeliverySignalInRawStatus(rawStatus: string | undefined | null): boolean {
  const s = (rawStatus ?? '').toLowerCase().trim();
  if (!s) return false;
  return [
    'delivering',
    'ready_for_pickup',
    'pickup',
    'delivered',
    'sold',
    'receive',
  ].includes(s);
}

function resolveCancellationKind(params: {
  marketplace: MarketplaceType;
  mappedStatus: OrderStatus;
  incomingRawStatus?: string | null;
  existingStatus?: OrderStatus;
  existingRawStatus?: string | null;
  ozonCancelledAfterShip?: boolean;
}): OrderCancellationKind | null {
  if (params.mappedStatus !== OrderStatus.CANCELLED) return null;

  if (params.marketplace === 'OZON') {
    if (params.ozonCancelledAfterShip === true) return OrderCancellationKind.REFUSAL;
    if (params.ozonCancelledAfterShip === false) return OrderCancellationKind.CANCELLATION;
  }

  if (params.existingStatus && isDeliveryLifecycleStatus(params.existingStatus)) {
    return OrderCancellationKind.REFUSAL;
  }
  if (
    hasDeliverySignalInRawStatus(params.existingRawStatus) ||
    hasDeliverySignalInRawStatus(params.incomingRawStatus)
  ) {
    return OrderCancellationKind.REFUSAL;
  }
  return OrderCancellationKind.CANCELLATION;
}

/** Макс. надёжный интервал для sync_proxy: если > 72ч, оценка ненадёжна (заказ мог быть сдан давно) */
const MAX_TRUSTED_PROCESSING_MIN = 72 * 60;

/** Проверка: заказ уже резервировал остаток (по StockLog с note, содержащим externalId) */
async function orderHasReservedStock(prisma: PrismaService, orderId: string, externalId: string): Promise<boolean> {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { productId: true, quantity: true },
  });
  if (items.length === 0) return false;
  for (const item of items) {
    const logs = await prisma.stockLog.findMany({
      where: {
        productId: item.productId,
        delta: { lt: 0 },
        source: 'SALE',
        note: { contains: externalId },
      },
      select: { delta: true },
    });
    const reserved = logs.reduce((s, l) => s + Math.abs(l.delta), 0);
    if (reserved < item.quantity) return false;
  }
  return true;
}

/** FBO: товар со склада маркетплейса — не списывать остаток «Мой склад». WB: DBW. Ozon: isFbo. */
function isFboOrder(order: {
  marketplace: string;
  wbFulfillmentType?: string | null;
  isFbo?: boolean | null;
}): boolean {
  if (order.marketplace === 'WILDBERRIES' && order.wbFulfillmentType === 'DBW') return true;
  if (order.marketplace === 'OZON' && order.isFbo) return true;
  return false;
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private marketplacesService: MarketplacesService,
    private productMappingService: ProductMappingService,
    private productsService: ProductsService,
    private stockService: StockService,
    private salesSourcesService: SalesSourcesService,
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

  async findPaged(
    userId: string,
    params: {
      limit?: number;
      offset?: number;
      sortBy?: 'createdAt' | 'totalAmount' | 'warehouse' | 'status' | 'processingTime';
      sortDirection?: 'asc' | 'desc';
      assemblyOnly?: boolean;
    },
  ) {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const sortBy = params.sortBy ?? 'totalAmount';
    const sortDirection = params.sortDirection ?? 'desc';

    const where: Record<string, unknown> = { userId };
    if (params.assemblyOnly) {
      where.status = { in: [OrderStatus.NEW, OrderStatus.IN_PROGRESS] };
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: { include: { product: true } },
          processingTime: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    const mapped = orders.map((o) => {
      const fromTable = o.processingTime?.processingTimeMin;
      const fromLegacy = o.processingTimeMin;
      const val = fromTable ?? (fromLegacy != null && fromLegacy <= MAX_TRUSTED_PROCESSING_MIN ? fromLegacy : null);
      return { ...o, processingTimeMin: val };
    });

    const dir = sortDirection === 'desc' ? -1 : 1;
    const sorted = [...mapped].sort((a, b) => {
      let va: string | number = 0;
      let vb: string | number = 0;
      if (sortBy === 'totalAmount') {
        va = Number(a.totalAmount);
        vb = Number(b.totalAmount);
      } else if (sortBy === 'warehouse') {
        va = (a.warehouseName ?? '').toLowerCase();
        vb = (b.warehouseName ?? '').toLowerCase();
      } else if (sortBy === 'status') {
        va = a.status;
        vb = b.status;
      } else if (sortBy === 'processingTime') {
        va = a.processingTimeMin ?? -1;
        vb = b.processingTimeMin ?? -1;
      } else {
        va = new Date(a.createdAt).getTime();
        vb = new Date(b.createdAt).getTime();
      }
      if (va === vb) return 0;
      return va > vb ? dir : -dir;
    });

    return {
      items: sorted,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    };
  }

  /** Создание ручного заказа (MANUAL). */
  async createManualOrder(userId: string, dto: CreateManualOrderDto) {
    const externalId = dto.externalId.trim();
    if (!externalId) {
      throw new BadRequestException('Укажите номер заказа');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, userId },
    });
    if (!product) {
      throw new BadRequestException('Товар не найден');
    }

    const existing = await this.prisma.order.findUnique({
      where: { userId_marketplace_externalId: { userId, marketplace: 'MANUAL', externalId } },
    });
    if (existing) {
      throw new BadRequestException(`Заказ с номером «${externalId}» уже существует`);
    }

    const salesSourceNormalized = await this.salesSourcesService.upsert(userId, dto.salesSource);
    const salesSourceName = salesSourceNormalized.name;

    const quantity = Math.floor(Number(dto.quantity));
    if (quantity < 1) {
      throw new BadRequestException('Количество должно быть не менее 1');
    }
    const price = Number(dto.price);
    const totalAmount = price * quantity;

    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          userId,
          marketplace: 'MANUAL',
          externalId,
          status: OrderStatus.NEW,
          totalAmount,
          salesSource: salesSourceName,
        },
      });
      await tx.orderItem.create({
        data: {
          orderId: o.id,
          productId: product.id,
          quantity,
          price,
        },
      });
      return o;
    });

    return this.prisma.order.findUnique({
      where: { id: order.id },
      include: { items: { include: { product: true } } },
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

  /**
   * Диагностика Ozon FBS: возвращает сырой ответ API, извлечённые данные
   * и результат маппинга каждого отправления.
   * GET /orders/ozon-fbs-diag?days=30
   */
  async diagOzonFbs(userId: string, days = 14) {
    return this.marketplacesService.diagOzonFbsRaw(userId, days);
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

  /** Обновление статуса заказа. Только для MANUAL — смена статуса пользователем. Маркетплейсные — через sync. */
  async updateStatus(userId: string, orderId: string, status: OrderStatus) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: { include: { product: { select: { id: true, stock: true, title: true, article: true } } } } },
    });
    if (!order) return null;
    if (order.marketplace !== 'MANUAL') {
      throw new BadRequestException('Смена статуса доступна только для самостоятельно созданных заказов');
    }

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

    // Сначала передаём статус на маркетплейс — при ошибке пользователь получит сообщение (MANUAL — не пушим)
    if (order.status === OrderStatus.NEW && status === OrderStatus.IN_PROGRESS && order.marketplace !== 'MANUAL') {
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
   * Пометить заказ WB как FBO (товар со склада WB) и вернуть ошибочно зарезервированный остаток.
   * Для заказов, которые WB отгружает со своего СЦ (возврат/отказ → новый заказ).
   */
  async markOrderAsFbo(orderIdOrExternalId: string): Promise<{ ok: boolean; released: number; message?: string }> {
    const order = await this.prisma.order.findFirst({
      where: {
        marketplace: 'WILDBERRIES',
        OR: [{ id: orderIdOrExternalId }, { externalId: orderIdOrExternalId }],
      },
      include: { items: { include: { product: { select: { id: true, userId: true } } } } },
    });
    if (!order) return { ok: false, released: 0, message: 'Заказ WB не найден' };
    if (isFboOrder(order)) {
      return { ok: true, released: 0, message: 'Заказ уже помечен как FBO' };
    }
    const userId = order.userId;
    const externalId = order.externalId;
    let released = 0;
    for (const item of order.items) {
      if (!item.product) continue;
      const hadReserve = await this.prisma.stockLog.findFirst({
        where: {
          productId: item.productId,
          source: 'SALE',
          delta: { lt: 0 },
          note: { contains: `Заказ ${externalId}` },
        },
      });
      if (hadReserve) {
        await this.stockService.release(item.productId, userId, item.quantity, {
          source: 'SALE' as const,
          note: `Исправление FBO: заказ ${externalId} (WILDBERRIES) — товар со склада WB`,
        });
        released++;
      }
    }
    await this.prisma.order.update({
      where: { id: order.id },
      data: { wbFulfillmentType: 'DBW', isFbo: true },
    });
    return { ok: true, released, message: `Заказ ${externalId} помечен как FBO, возвращено ${released} позиций` };
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
    if (isFboOrder(order)) {
      return { ok: true, reserved: 0, message: 'FBO-заказ: товар со склада маркетплейса, резерв «Мой склад» не требуется' };
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

      // Проверка остатка только для FBS: FBO — товар со склада маркета, наш склад не проверяем
      let canProcess = true;
      if (!isFboOrder(order)) {
        for (const item of order.items) {
          const stock = item.product?.stock ?? 0;
          if (stock < item.quantity) {
            canProcess = false;
            const name = item.product?.title || item.product?.article || 'Товар';
            errors.push(`Заказ ${externalId}: недостаточно «${name}» (нужно ${item.quantity}, в наличии ${stock})`);
            break;
          }
        }
      }
      if (!canProcess) {
        skipped.push(externalId);
        continue;
      }

      try {
        // 1. Резервируем остаток только для FBS (не FBO). FBO — товар со склада маркета, «Мой склад» не трогаем.
        // Резерв один раз: проверяем, не резервировали ли уже (идемпотентность).
        const alreadyReserved = await orderHasReservedStock(this.prisma, order.id, externalId);
        console.log(`[processHoldExpiredOrders] order=${externalId} isFbo=${isFboOrder(order)} alreadyReserved=${alreadyReserved} willReserve=${!isFboOrder(order) && !alreadyReserved}`);
        if (!isFboOrder(order) && !alreadyReserved) {
          const reservedItems: Array<{ productId: string; userId: string; quantity: number }> = [];
          for (const item of order.items) {
            if (!item.product) {
              console.log(`[processHoldExpiredOrders] order=${externalId} SKIP: no product for item`);
              continue;
            }
            console.log(`[processHoldExpiredOrders] order=${externalId} product=${item.productId} stock=${item.product?.stock} qty=${item.quantity}`);
            await this.stockService.reserve(item.productId, item.product.userId, item.quantity, {
              source: 'SALE' as const,
              note: `Заказ ${externalId} (${order.marketplace}) — авто после холда`,
              allowNegative: false,
            });
            reservedItems.push({
              productId: item.productId,
              userId: item.product.userId,
              quantity: item.quantity,
            });
            console.log(`[processHoldExpiredOrders] order=${externalId} RESERVED qty=${item.quantity}`);
          }
          // 2. Отправляем статус на маркетплейс (MANUAL — не пушим)
          if (order.marketplace !== 'MANUAL') {
            try {
              await this.marketplacesService.pushOrderStatus(uid, order.marketplace, {
                marketplaceOrderId: order.externalId,
                status: OrderStatus.IN_PROGRESS,
                wbStickerNumber: order.wbStickerNumber ?? undefined,
                wbFulfillmentType: order.marketplace === 'WILDBERRIES' ? (order as { wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW' }).wbFulfillmentType ?? undefined : undefined,
              });
            } catch (pushErr) {
              // Откат резерва при ошибке push — иначе следующий запуск крона снова зарезервирует
              for (const r of reservedItems) {
                await this.stockService.release(r.productId, r.userId, r.quantity, {
                  source: 'SALE' as const,
                  note: `Откат: заказ ${externalId} — ошибка отправки статуса`,
                });
              }
              throw pushErr;
            }
          }
        } else if (!isFboOrder(order) && alreadyReserved) {
          // Резерв уже есть — только обновляем статус и пушим
          if (order.marketplace !== 'MANUAL') {
            await this.marketplacesService.pushOrderStatus(uid, order.marketplace, {
              marketplaceOrderId: order.externalId,
              status: OrderStatus.IN_PROGRESS,
              wbStickerNumber: order.wbStickerNumber ?? undefined,
              wbFulfillmentType: order.marketplace === 'WILDBERRIES' ? (order as { wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW' }).wbFulfillmentType ?? undefined : undefined,
            });
          }
        } else if (isFboOrder(order)) {
          // FBO — не трогаем наш склад, только обновляем статус
          if (order.marketplace !== 'MANUAL') {
            await this.marketplacesService.pushOrderStatus(uid, order.marketplace, {
              marketplaceOrderId: order.externalId,
              status: OrderStatus.IN_PROGRESS,
              wbStickerNumber: order.wbStickerNumber ?? undefined,
              wbFulfillmentType: order.marketplace === 'WILDBERRIES' ? (order as { wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW' }).wbFulfillmentType ?? undefined : undefined,
            });
          }
        }
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
          isFbo?: boolean | null;
          cancellationKind?: OrderCancellationKind | null;
          cancelledAfterShip?: boolean | null;
          cancellationInitiator?: string | null;
          cancellationType?: string | null;
          cancellationReason?: string | null;
          cancellationReasonId?: bigint | null;
          cancellationRaw?: Prisma.InputJsonValue;
        } = {};
        if (od.createdAt) updateData.createdAt = od.createdAt;
        if (existing.status !== OrderStatus.CANCELLED && isCancelled) {
          try {
            // Release для FBS (не FBO) — независимо от статуса (NEW или IN_PROGRESS)
            // Теперь резерв создаётся сразу при получении заказа, даже в холде
            if (!isFboOrder(existing)) {
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
        // Исключение: rawStatus "waiting" ранее ошибочно маппился в READY_FOR_PICKUP — корректируем на IN_PROGRESS.
        const hasFreshStatus = od.rawStatus != null || od.rawSupplierStatus != null;
        const cancellationKind = resolveCancellationKind({
          marketplace,
          mappedStatus: newStatus,
          incomingRawStatus: od.rawStatus ?? od.rawSupplierStatus ?? null,
          existingStatus: existing.status,
          existingRawStatus: existing.rawStatus,
          ozonCancelledAfterShip: od.cancellation?.cancelledAfterShip,
        });
        if (cancellationKind) {
          updateData.cancellationKind = cancellationKind;
        }
        if (od.cancellation) {
          updateData.cancelledAfterShip = od.cancellation.cancelledAfterShip ?? null;
          updateData.cancellationInitiator = od.cancellation.cancellationInitiator ?? null;
          updateData.cancellationType = od.cancellation.cancellationType ?? null;
          updateData.cancellationReason = od.cancellation.cancelReason ?? null;
          updateData.cancellationReasonId = od.cancellation.cancelReasonId != null ? BigInt(od.cancellation.cancelReasonId) : null;
          updateData.cancellationRaw = od.cancellation as Prisma.InputJsonValue;
        }
        if (hasFreshStatus) {
          const rawLower = (od.rawStatus ?? od.rawSupplierStatus ?? '').toString().toLowerCase();
          const correctWaiting =
            rawLower === 'waiting' && existing.status === OrderStatus.READY_FOR_PICKUP && newStatus === OrderStatus.IN_PROGRESS;
          const resolved = correctWaiting ? OrderStatus.IN_PROGRESS : pickResolvedStatus(existing.status, newStatus);
          if (resolved !== existing.status) {
            updateData.status = resolved;
            // Снятие резерва при отгрузке (отдали на ПВЗ): IN_PROGRESS → SHIPPED/READY_FOR_PICKUP
            const toShipped = resolved === OrderStatus.SHIPPED || resolved === OrderStatus.READY_FOR_PICKUP;
            if (toShipped && existing.status === OrderStatus.IN_PROGRESS && !isFboOrder(existing)) {
              try {
                for (const item of existing.items) {
                  await this.stockService.release(item.productId, userId, item.quantity, {
                    source: 'SALE' as const,
                    note: `Заказ ${externalId} (${marketplace}) — отгрузка на ПВЗ`,
                  });
                }
              } catch (err) {
                errors.push(`Снятие резерва ${externalId}: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
          }
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
          const newIsFbo = od.wbFulfillmentType === 'DBW' || (od as { isFbo?: boolean }).isFbo;
          if (od.wbFulfillmentType && existing.marketplace === 'WILDBERRIES') {
            updateData.wbFulfillmentType = od.wbFulfillmentType;
            if (newIsFbo) updateData.isFbo = true;
          }
          // Исправление FBO: заказ был ошибочно помечен как FBS — возвращаем остаток
          if (
            newIsFbo &&
            existing.status === OrderStatus.IN_PROGRESS &&
            !isFboOrder(existing)
          ) {
            try {
              for (const item of existing.items) {
                await this.stockService.release(item.productId, userId, item.quantity, {
                  source: 'SALE' as const,
                  note: `Исправление FBO: заказ ${externalId} (${marketplace}) — товар со склада WB`,
                });
              }
            } catch (err) {
              errors.push(`FBO backfill ${externalId}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
        if (marketplace === 'OZON' && (od as { isFbo?: boolean }).isFbo) {
          updateData.isFbo = true;
        }
        if (existing.ozonPostingNumber == null && marketplace === 'OZON') {
          (updateData as Record<string, unknown>).ozonPostingNumber = externalId;
        }
        if (Object.keys(updateData).length > 0) {
          const nextStatus = updateData.status ?? existing.status;
          await this.prisma.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: existing.id },
              data: updateData,
            });
            if (updateData.status && updateData.status !== existing.status) {
              await tx.orderStatusEvent.create({
                data: {
                  orderId: existing.id,
                  status: nextStatus,
                  rawStatus: od.rawStatus ?? od.rawSupplierStatus ?? null,
                  source: 'sync',
                  cancellationKind: updateData.cancellationKind ?? null,
                  metadata: {
                    marketplace,
                    externalId,
                    previousStatus: existing.status,
                    nextStatus,
                    cancellation: od.cancellation ?? null,
                  },
                },
              });
            }
          });
          // WB: при переходе в «На сборке» — всегда отправляем статус на WB (иначе «Добавить коробку» не сработает)
          if (updateData.status === OrderStatus.IN_PROGRESS && marketplace === 'WILDBERRIES') {
            try {
              await this.marketplacesService.pushOrderStatus(userId, marketplace, {
                marketplaceOrderId: externalId,
                status: OrderStatus.IN_PROGRESS,
                wbStickerNumber: existing.wbStickerNumber ?? undefined,
                wbFulfillmentType: (existing as { wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW' | null }).wbFulfillmentType ?? undefined,
              });
            } catch (pushErr) {
              const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
              errors.push(`Заказ ${externalId}: статус не передан на WB — ${msg}. Нажмите «Отправить на WB» вручную.`);
            }
          }
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
        // Ozon FBS v3: ozonOfferId = offer_id (seller article) для поиска по externalArticle
        const ozonOfferId = (od as { ozonOfferId?: string }).ozonOfferId;
        const product = await this.findProductByMarketplaceId(userId, marketplace, od.productId, ozonOfferId);
        if (!product) {
          errors.push(`Заказ ${externalId}: товар ${od.productId} не найден в каталоге`);
          continue;
        }

        const status = this.mapStatus(od.status);
        const cancellationKind = resolveCancellationKind({
          marketplace,
          mappedStatus: status,
          incomingRawStatus: od.rawStatus ?? od.rawSupplierStatus ?? null,
          ozonCancelledAfterShip: od.cancellation?.cancelledAfterShip,
        });
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
        const odIsFbo = (od as { isFbo?: boolean }).isFbo ?? (marketplace === 'WILDBERRIES' && (od as { wbFulfillmentType?: string }).wbFulfillmentType === 'DBW');
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
              isFbo: odIsFbo || undefined,
              cancellationKind,
              cancelledAfterShip: od.cancellation?.cancelledAfterShip ?? null,
              cancellationInitiator: od.cancellation?.cancellationInitiator ?? null,
              cancellationType: od.cancellation?.cancellationType ?? null,
              cancellationReason: od.cancellation?.cancelReason ?? null,
              cancellationReasonId: od.cancellation?.cancelReasonId != null ? BigInt(od.cancellation.cancelReasonId) : null,
              cancellationRaw: od.cancellation ? (od.cancellation as Prisma.InputJsonValue) : undefined,
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
          await tx.orderStatusEvent.create({
            data: {
              orderId: o.id,
              status,
              rawStatus: od.rawStatus ?? od.rawSupplierStatus ?? null,
              source: 'sync',
              cancellationKind,
              metadata: {
                marketplace,
                externalId,
                cancellation: od.cancellation ?? null,
              },
            },
          });
          return o;
        });

        // Резерв при создании — для FBS (не FBO) ВСЕГДА, даже в холде. FBO — товар со склада маркета.
        // Логика: остаток уменьшается сразу, но заказ нельзя обработать до истечения холда.
        console.log(`[syncFromMarketplaces] order=${externalId} status=${status} odIsFbo=${odIsFbo} willReserve=${!odIsFbo}`);
        if (!odIsFbo) {
          await this.stockService.reserve(product.id, product.userId, quantity, {
            source: 'SALE' as const,
            note: `Заказ ${externalId} (${marketplace})`,
            allowNegative: true,
          });
          console.log(`[syncFromMarketplaces] order=${externalId} RESERVED at creation`);
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
      select: { id: true, externalId: true, status: true, rawStatus: true, wbStickerNumber: true, wbFulfillmentType: true },
    });
    for (const o of toReconcile) {
      const targetStatus = this.mapStatus(o.rawStatus!);
      if (targetStatus === OrderStatus.CANCELLED) continue;
      const rawLower = (o.rawStatus ?? '').toString().toLowerCase();
      const correctWaiting = rawLower === 'waiting' && o.status === OrderStatus.READY_FOR_PICKUP && targetStatus === OrderStatus.IN_PROGRESS;
      if (correctWaiting || STATUS_RANK[targetStatus] > STATUS_RANK[o.status]) {
        await this.prisma.order.update({
          where: { id: o.id },
          data: { status: targetStatus },
        });
        // WB: при переходе в «На сборке» — отправляем статус на WB
        if (targetStatus === OrderStatus.IN_PROGRESS) {
          try {
            await this.marketplacesService.pushOrderStatus(userId, 'WILDBERRIES', {
              marketplaceOrderId: o.externalId,
              status: OrderStatus.IN_PROGRESS,
              wbStickerNumber: o.wbStickerNumber ?? undefined,
              wbFulfillmentType: o.wbFulfillmentType ?? undefined,
            });
          } catch {
            /* тихо — пользователь может нажать «Отправить на WB» вручную */
          }
        }
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
    ozonOfferId?: string,
  ) {
    // 1. Маппинг по системному ID (externalSystemId) — надёжно для FBO
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

    if (marketplace === 'OZON') {
      // 3. Ozon FBS v3: products[].sku ≠ product_id в маппинге.
      //    offer_id = seller article = externalArticle в маппинге → ищем по нему первым.
      if (ozonOfferId?.trim()) {
        const byArticle = await this.productMappingService.findProductByExternalArticle([userId], 'OZON', ozonOfferId.trim());
        if (byArticle) return byArticle;
        // Fallback: товар найден по артикулу в каталоге, но маппинг отсутствует — создаём связку
        const byProductArticle = await this.productsService.findByArticle(userId, ozonOfferId.trim());
        if (byProductArticle) {
          await this.productMappingService.upsertMapping(byProductArticle.id, userId, 'OZON', marketplaceProductId, {
            externalArticle: ozonOfferId.trim(),
          });
          return byProductArticle;
        }
      }

      // 4. Fallback: автосоздание/привязка товара по product_id (FBO, legacy)
      if (marketplaceProductId?.trim()) {
        const created = await this.marketplacesService.ensureOzonProductInCatalog(userId, marketplaceProductId.trim());
        if (created) return created;
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
    }
    return null;
  }
}
