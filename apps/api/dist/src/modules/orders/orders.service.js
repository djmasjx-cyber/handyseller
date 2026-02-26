"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const marketplaces_service_1 = require("../marketplaces/marketplaces.service");
const product_mapping_service_1 = require("../marketplaces/product-mapping.service");
const products_service_1 = require("../products/products.service");
const stock_service_1 = require("../products/stock.service");
const client_1 = require("@prisma/client");
const MARKETPLACE_STATUS_TO_ORDER = {
    new: client_1.OrderStatus.NEW,
    confirm: client_1.OrderStatus.IN_PROGRESS,
    confirmed: client_1.OrderStatus.IN_PROGRESS,
    complete: client_1.OrderStatus.SHIPPED,
    deliver: client_1.OrderStatus.SHIPPED,
    sorted: client_1.OrderStatus.SHIPPED,
    shipped: client_1.OrderStatus.SHIPPED,
    ready_for_pickup: client_1.OrderStatus.READY_FOR_PICKUP,
    waiting: client_1.OrderStatus.READY_FOR_PICKUP,
    sold: client_1.OrderStatus.DELIVERED,
    receive: client_1.OrderStatus.DELIVERED,
    delivered: client_1.OrderStatus.DELIVERED,
    cancelled: client_1.OrderStatus.CANCELLED,
    canceled: client_1.OrderStatus.CANCELLED,
    cancel: client_1.OrderStatus.CANCELLED,
    reject: client_1.OrderStatus.CANCELLED,
    rejected: client_1.OrderStatus.CANCELLED,
    awaiting_packaging: client_1.OrderStatus.NEW,
    awaiting_packaging_cancelled: client_1.OrderStatus.CANCELLED,
    awaiting_deliver: client_1.OrderStatus.IN_PROGRESS,
    delivering: client_1.OrderStatus.SHIPPED,
    cancelled_by_seller: client_1.OrderStatus.CANCELLED,
    cancelled_by_client: client_1.OrderStatus.CANCELLED,
    processing: client_1.OrderStatus.NEW,
    delivery: client_1.OrderStatus.SHIPPED,
    pickup: client_1.OrderStatus.SHIPPED,
};
const HOLD_MINUTES = 60;
const STATUS_RANK = {
    [client_1.OrderStatus.NEW]: 0,
    [client_1.OrderStatus.IN_PROGRESS]: 1,
    [client_1.OrderStatus.SHIPPED]: 2,
    [client_1.OrderStatus.READY_FOR_PICKUP]: 3,
    [client_1.OrderStatus.DELIVERED]: 4,
    [client_1.OrderStatus.CANCELLED]: -1,
};
function pickResolvedStatus(existing, fromApi) {
    if (fromApi === client_1.OrderStatus.CANCELLED)
        return client_1.OrderStatus.CANCELLED;
    if (existing === client_1.OrderStatus.CANCELLED)
        return existing;
    return STATUS_RANK[fromApi] > STATUS_RANK[existing] ? fromApi : existing;
}
const WB_HANDED_OVER_SUPPLIER_STATUSES = new Set(['complete', 'deliver']);
const WB_SORTED_RAW_STATUSES = new Set(['sorted']);
function isWbHandedOverAtAcceptancePoint(rawSupplierStatus, rawStatus) {
    if (rawSupplierStatus != null && WB_HANDED_OVER_SUPPLIER_STATUSES.has(rawSupplierStatus.toLowerCase())) {
        return true;
    }
    return rawStatus != null && WB_SORTED_RAW_STATUSES.has(rawStatus.toLowerCase());
}
function isRawStatusHandedOver(raw) {
    if (raw == null || raw.trim() === '')
        return false;
    const s = raw.toLowerCase().trim();
    return WB_HANDED_OVER_SUPPLIER_STATUSES.has(s) || WB_SORTED_RAW_STATUSES.has(s);
}
function calcProcessingTimeMin(createdAt, deliveredAtProxy = new Date()) {
    const mins = (deliveredAtProxy.getTime() - createdAt.getTime()) / (60 * 1000);
    return Math.round(Math.max(0, mins));
}
const MAX_TRUSTED_PROCESSING_MIN = 72 * 60;
let OrdersService = class OrdersService {
    constructor(prisma, marketplacesService, productMappingService, productsService, stockService) {
        this.prisma = prisma;
        this.marketplacesService = marketplacesService;
        this.productMappingService = productMappingService;
        this.productsService = productsService;
        this.stockService = stockService;
    }
    async getOrderStats(userId) {
        const [inProgressCount, newOrders] = await Promise.all([
            this.prisma.order.count({ where: { userId, status: client_1.OrderStatus.IN_PROGRESS } }),
            this.prisma.order.findMany({
                where: { userId, status: client_1.OrderStatus.NEW },
                select: { rawStatus: true },
            }),
        ]);
        const excluded = newOrders.filter((o) => isRawStatusHandedOver(o.rawStatus)).length;
        const newCount = Math.max(0, newOrders.length - excluded);
        return { newCount, inProgressCount };
    }
    async findAll(userId) {
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
    async getWbStickerImage(userId, orderId) {
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
    async getWbOrderStatusDebug(userId, orderIdOrSrid) {
        return this.marketplacesService.getWbOrderStatus(userId, orderIdOrSrid);
    }
    async getRawOrdersFromWb(userId) {
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
    async updateStatus(userId, orderId, status) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, userId },
            include: { items: { include: { product: { select: { id: true, stock: true, title: true, article: true } } } } },
        });
        if (!order)
            return null;
        if (order.status === client_1.OrderStatus.NEW && status === client_1.OrderStatus.IN_PROGRESS) {
            const now = new Date();
            const holdUntil = order.holdUntil;
            if (holdUntil && now < holdUntil) {
                throw new common_1.BadRequestException(`Заказ в холде до ${holdUntil.toLocaleTimeString('ru-RU')}. Клиент может отменить в течение ${HOLD_MINUTES} мин. Переход в «На сборке» — автоматически после холда.`);
            }
            for (const item of order.items) {
                const stock = item.product?.stock ?? 0;
                if (stock < item.quantity) {
                    const name = item.product?.title || item.product?.article || 'Товар';
                    throw new common_1.BadRequestException(`Недостаточно остатка для «${name}»: нужно ${item.quantity}, в наличии ${stock}.`);
                }
            }
        }
        if (order.status === client_1.OrderStatus.NEW && status === client_1.OrderStatus.IN_PROGRESS) {
            await this.marketplacesService.pushOrderStatus(userId, order.marketplace, {
                marketplaceOrderId: order.externalId,
                status: status,
                wbStickerNumber: order.wbStickerNumber ?? undefined,
                wbFulfillmentType: order.marketplace === 'WILDBERRIES' ? order.wbFulfillmentType ?? undefined : undefined,
            });
        }
        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: { status },
        });
        return updated;
    }
    async retryStockReserveByExternalId(orderIdOrExternalId) {
        const order = await this.prisma.order.findFirst({
            where: {
                OR: [{ id: orderIdOrExternalId }, { externalId: orderIdOrExternalId }],
            },
            select: { userId: true },
        });
        if (!order)
            return { ok: false, reserved: 0, message: 'Заказ не найден' };
        return this.retryStockReserve(order.userId, orderIdOrExternalId);
    }
    async retryStockReserve(userId, orderIdOrExternalId) {
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
        if (!order)
            return { ok: false, reserved: 0, message: 'Заказ не найден' };
        if (order.status === client_1.OrderStatus.CANCELLED) {
            return { ok: false, reserved: 0, message: 'Заказ отменён, резерв не нужен' };
        }
        let reserved = 0;
        for (const item of order.items) {
            if (!item.product)
                continue;
            const alreadyReserved = await this.prisma.stockLog.findFirst({
                where: {
                    productId: item.productId,
                    source: 'SALE',
                    note: { contains: `Заказ ${order.externalId}` },
                },
            });
            if (!alreadyReserved) {
                await this.stockService.reserve(item.productId, item.product.userId, item.quantity, {
                    source: 'SALE',
                    note: `Заказ ${order.externalId} (${order.marketplace})`,
                    allowNegative: true,
                });
                reserved++;
            }
        }
        return { ok: true, reserved };
    }
    async retryPushOrderStatus(userId, orderId) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, userId },
        });
        if (!order)
            return { ok: false, message: 'Заказ не найден' };
        if (order.marketplace !== 'WILDBERRIES') {
            return { ok: false, message: 'Повторная отправка поддерживается только для заказов WB' };
        }
        if (order.status !== client_1.OrderStatus.IN_PROGRESS) {
            return { ok: false, message: 'Повторная отправка только для заказов в статусе «На сборке»' };
        }
        try {
            await this.marketplacesService.pushOrderStatus(userId, order.marketplace, {
                marketplaceOrderId: order.externalId,
                status: order.status,
                wbStickerNumber: order.wbStickerNumber ?? undefined,
                wbFulfillmentType: order.wbFulfillmentType ?? undefined,
            });
            return { ok: true };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { ok: false, message: msg };
        }
    }
    async processHoldExpiredOrders(userId) {
        const now = new Date();
        const where = {
            status: client_1.OrderStatus.NEW,
            holdUntil: { lte: now },
        };
        if (userId)
            where.userId = userId;
        const orders = await this.prisma.order.findMany({
            where: where,
            include: { items: { include: { product: { select: { id: true, userId: true, stock: true, title: true, article: true } } } } },
            orderBy: { holdUntil: 'asc' },
        });
        let processed = 0;
        const skipped = [];
        const errors = [];
        for (const order of orders) {
            const uid = order.userId;
            const externalId = order.externalId;
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
                for (const item of order.items) {
                    if (!item.product)
                        continue;
                    await this.stockService.reserve(item.productId, item.product.userId, item.quantity, {
                        source: 'SALE',
                        note: `Заказ ${externalId} (${order.marketplace}) — авто после холда`,
                        allowNegative: false,
                    });
                }
                await this.marketplacesService.pushOrderStatus(uid, order.marketplace, {
                    marketplaceOrderId: order.externalId,
                    status: client_1.OrderStatus.IN_PROGRESS,
                    wbStickerNumber: order.wbStickerNumber ?? undefined,
                    wbFulfillmentType: order.marketplace === 'WILDBERRIES' ? order.wbFulfillmentType ?? undefined : undefined,
                });
                await this.prisma.order.update({
                    where: { id: order.id },
                    data: { status: client_1.OrderStatus.IN_PROGRESS },
                });
                processed++;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`Заказ ${externalId}: ${msg}`);
                skipped.push(externalId);
            }
        }
        return { processed, skipped: skipped.length, errors };
    }
    async syncFromMarketplaces(userId, since) {
        const sinceDate = since ?? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const orders = await this.marketplacesService.getOrdersFromAllMarketplaces(userId, sinceDate);
        let synced = 0;
        const skipped = [];
        const errors = [];
        const processedThisRun = new Set();
        for (const od of orders) {
            const marketplace = (od.marketplace ?? 'WILDBERRIES');
            const externalId = od.marketplaceOrderId;
            const quantity = od.quantity ?? 1;
            const existing = await this.prisma.order.findUnique({
                where: {
                    userId_marketplace_externalId: { userId, marketplace, externalId },
                },
                include: { items: true, processingTime: true },
            });
            const statusForMapping = od.rawStatus ?? od.rawSupplierStatus ?? od.status;
            const newStatus = this.mapStatus(statusForMapping);
            const isCancelled = newStatus === client_1.OrderStatus.CANCELLED;
            if (existing) {
                const updateData = {};
                if (od.createdAt)
                    updateData.createdAt = od.createdAt;
                if (existing.status !== client_1.OrderStatus.CANCELLED && isCancelled) {
                    try {
                        if (existing.status === client_1.OrderStatus.IN_PROGRESS) {
                            for (const item of existing.items) {
                                await this.stockService.release(item.productId, userId, item.quantity, {
                                    source: 'SALE',
                                    note: `Отмена заказа ${externalId} (${marketplace})`,
                                });
                            }
                        }
                        updateData.status = client_1.OrderStatus.CANCELLED;
                    }
                    catch (err) {
                        errors.push(`Отмена ${externalId}: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }
                const hasFreshStatus = od.rawStatus != null || od.rawSupplierStatus != null;
                if (hasFreshStatus) {
                    const resolved = pickResolvedStatus(existing.status, newStatus);
                    if (resolved !== existing.status)
                        updateData.status = resolved;
                }
                if (od.warehouseName != null || od.rawStatus != null) {
                    if (od.warehouseName != null)
                        updateData.warehouseName = od.warehouseName;
                    if (od.rawStatus != null)
                        updateData.rawStatus = od.rawStatus;
                }
                if (od.rawSupplierStatus != null && !updateData.rawStatus) {
                    updateData.rawStatus = od.rawSupplierStatus;
                }
                if (marketplace === 'WILDBERRIES') {
                    const needFix = existing.wbStickerNumber == null || existing.wbStickerNumber === existing.externalId;
                    if (needFix)
                        updateData.wbStickerNumber = od.id;
                    if (od.wbFulfillmentType && existing.marketplace === 'WILDBERRIES') {
                        updateData.wbFulfillmentType = od.wbFulfillmentType;
                    }
                }
                if (existing.ozonPostingNumber == null && marketplace === 'OZON') {
                    updateData.ozonPostingNumber = externalId;
                }
                if (Object.keys(updateData).length > 0) {
                    await this.prisma.order.update({
                        where: { id: existing.id },
                        data: updateData,
                    });
                }
                if (isWbHandedOverAtAcceptancePoint(od.rawSupplierStatus, od.rawStatus) &&
                    !existing.processingTime &&
                    existing.createdAt) {
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
                const product = await this.findProductByMarketplaceId(userId, marketplace, od.productId);
                if (!product) {
                    errors.push(`Заказ ${externalId}: товар ${od.productId} не найден в каталоге`);
                    continue;
                }
                const status = this.mapStatus(od.status);
                const amount = od.amount ?? 0;
                const holdUntil = status === client_1.OrderStatus.NEW
                    ? new Date(Date.now() + HOLD_MINUTES * 60 * 1000)
                    : undefined;
                const productWithBarcodes = await this.prisma.product.findUnique({
                    where: { id: product.id },
                    select: { barcodeWb: true, barcodeOzon: true },
                });
                const productBarcodeWb = productWithBarcodes?.barcodeWb ?? null;
                const productBarcodeOzon = productWithBarcodes?.barcodeOzon ?? null;
                const wbStickerNumber = marketplace === 'WILDBERRIES' ? od.id : null;
                const ozonPostingNumber = marketplace === 'OZON' ? externalId : null;
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
                            wbFulfillmentType: marketplace === 'WILDBERRIES' && od.wbFulfillmentType
                                ? od.wbFulfillmentType
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
                if (status !== client_1.OrderStatus.NEW) {
                    await this.stockService.reserve(product.id, product.userId, quantity, {
                        source: 'SALE',
                        note: `Заказ ${externalId} (${marketplace})`,
                        allowNegative: true,
                    });
                }
                processedThisRun.add(externalId);
                synced++;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`Заказ ${externalId}: ${msg}`);
            }
        }
        const refreshSinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const processedList = Array.from(processedThisRun);
        const wbOrdersToRefresh = await this.prisma.order.findMany({
            where: {
                userId,
                marketplace: 'WILDBERRIES',
                status: { not: client_1.OrderStatus.CANCELLED },
                createdAt: { gte: refreshSinceDate },
                OR: [
                    { externalId: processedList.length ? { notIn: processedList } : { not: '__impossible__' } },
                    { status: client_1.OrderStatus.NEW, OR: [{ rawStatus: null }, { rawStatus: '' }] },
                    { status: client_1.OrderStatus.IN_PROGRESS },
                    { status: client_1.OrderStatus.SHIPPED },
                    { status: client_1.OrderStatus.READY_FOR_PICKUP },
                ],
            },
            select: { id: true, externalId: true, wbStickerNumber: true, status: true, rawStatus: true },
            take: 120,
        });
        for (const ord of wbOrdersToRefresh) {
            const idToCheck = ord.wbStickerNumber ?? ord.externalId;
            if (!idToCheck)
                continue;
            try {
                const res = await this.marketplacesService.getWbOrderStatus(userId, idToCheck);
                const wb = res.wb;
                if (!wb?.found)
                    continue;
                const statusFromWb = (wb.wbStatus ?? wb.supplierStatus ?? '').trim();
                if (!statusFromWb)
                    continue;
                const newStatus = this.mapStatus(statusFromWb);
                const rawMatch = (ord.rawStatus ?? '').toLowerCase() === statusFromWb.toLowerCase();
                const needsUpdate = newStatus !== ord.status || !rawMatch;
                if (needsUpdate) {
                    await this.prisma.order.update({
                        where: { id: ord.id },
                        data: { status: newStatus, rawStatus: statusFromWb },
                    });
                }
            }
            catch {
            }
        }
        const toReconcile = await this.prisma.order.findMany({
            where: {
                userId,
                marketplace: 'WILDBERRIES',
                status: { in: [client_1.OrderStatus.NEW, client_1.OrderStatus.IN_PROGRESS, client_1.OrderStatus.SHIPPED, client_1.OrderStatus.READY_FOR_PICKUP] },
                rawStatus: { not: null },
            },
            select: { id: true, status: true, rawStatus: true },
        });
        for (const o of toReconcile) {
            const targetStatus = this.mapStatus(o.rawStatus);
            if (targetStatus === client_1.OrderStatus.CANCELLED)
                continue;
            if (STATUS_RANK[targetStatus] > STATUS_RANK[o.status]) {
                await this.prisma.order.update({
                    where: { id: o.id },
                    data: { status: targetStatus },
                });
            }
        }
        return { synced, skipped: skipped.length, errors };
    }
    mapStatus(status) {
        if (typeof status === 'number') {
            const numMap = {
                0: client_1.OrderStatus.NEW,
                1: client_1.OrderStatus.NEW,
                2: client_1.OrderStatus.IN_PROGRESS,
                3: client_1.OrderStatus.SHIPPED,
                4: client_1.OrderStatus.DELIVERED,
                5: client_1.OrderStatus.CANCELLED,
            };
            return numMap[status] ?? client_1.OrderStatus.NEW;
        }
        const key = (status || '').toLowerCase().replace(/\s/g, '');
        return MARKETPLACE_STATUS_TO_ORDER[key] ?? client_1.OrderStatus.NEW;
    }
    async findProductByMarketplaceId(userId, marketplace, marketplaceProductId) {
        const product = await this.productMappingService.findProductByExternalId(userId, marketplace, String(marketplaceProductId));
        if (product)
            return product;
        if (marketplace === 'WILDBERRIES') {
            const sku = `WB-${userId.slice(0, 8)}-${marketplaceProductId}`;
            const bySku = await this.productsService.findBySku(userId, sku);
            if (bySku)
                return bySku;
            const bySuffix = await this.productsService.findBySkuSuffix(userId, `-${marketplaceProductId}`);
            if (bySuffix)
                return bySuffix;
            return (await this.productsService.findByArticle(userId, marketplaceProductId)) ?? null;
        }
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
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        marketplaces_service_1.MarketplacesService,
        product_mapping_service_1.ProductMappingService,
        products_service_1.ProductsService,
        stock_service_1.StockService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map