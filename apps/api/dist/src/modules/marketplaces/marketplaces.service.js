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
exports.MarketplacesService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
function mapWbStatusToOurs(s) {
    const key = (s || '').toLowerCase().replace(/\s/g, '');
    const m = {
        new: 'NEW',
        confirm: 'IN_PROGRESS',
        confirmed: 'IN_PROGRESS',
        complete: 'SHIPPED',
        deliver: 'SHIPPED',
        sorted: 'SHIPPED',
        shipped: 'SHIPPED',
        ready_for_pickup: 'READY_FOR_PICKUP',
        waiting: 'READY_FOR_PICKUP',
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
async function withRetry(fn, label) {
    let lastError;
    for (let i = 0; i < RETRY_ATTEMPTS; i++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            if (i < RETRY_ATTEMPTS - 1) {
                await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
            }
        }
    }
    throw lastError;
}
const prisma_service_1 = require("../../common/database/prisma.service");
const client_1 = require("@prisma/client");
const crypto_service_1 = require("../../common/crypto/crypto.service");
const products_service_1 = require("../products/products.service");
const subscriptions_service_1 = require("../subscriptions/subscriptions.service");
const marketplace_adapter_factory_1 = require("./adapters/marketplace-adapter.factory");
const canonical_1 = require("./canonical");
const wildberries_adapter_1 = require("./adapters/wildberries.adapter");
const ozon_adapter_1 = require("./adapters/ozon.adapter");
const product_mapping_service_1 = require("./product-mapping.service");
const wb_supply_service_1 = require("./wb-supply.service");
let MarketplacesService = class MarketplacesService {
    constructor(prisma, crypto, adapterFactory, productsService, productMappingService, subscriptionsService, eventEmitter, wbSupplyService) {
        this.prisma = prisma;
        this.crypto = crypto;
        this.adapterFactory = adapterFactory;
        this.productsService = productsService;
        this.productMappingService = productMappingService;
        this.subscriptionsService = subscriptionsService;
        this.eventEmitter = eventEmitter;
        this.wbSupplyService = wbSupplyService;
    }
    async getEffectiveUserIds(userId) {
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
    async getMarketplaceConnection(userId, marketplace) {
        const ids = await this.getEffectiveUserIds(userId);
        for (const uid of ids) {
            const conn = await this.prisma.marketplaceConnection.findFirst({
                where: { userId: uid, marketplace },
            });
            if (conn)
                return conn;
        }
        return null;
    }
    async findAll(userId) {
        const ids = await this.getEffectiveUserIds(userId);
        const list = await this.prisma.marketplaceConnection.findMany({
            where: { userId: { in: ids } },
        });
        const byMarketplace = new Map();
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
    async connect(userId, marketplace, token, refreshToken, sellerId, warehouseId, statsToken) {
        const tok = typeof token === 'string' ? token.trim() : '';
        const sid = typeof sellerId === 'string' ? sellerId.trim() : undefined;
        if (marketplace === 'OZON' && (!sid || !sid.length)) {
            throw new common_1.BadRequestException('Для Ozon укажите Client ID (числовой идентификатор из кабинета продавца: Настройки → API-ключи).');
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
                    throw new common_1.BadRequestException('Неверный API ключ или данные подключения. Проверьте токен и sellerId.');
                }
            }
        }
        catch (err) {
            if (err instanceof common_1.BadRequestException)
                throw err;
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.startsWith('Ozon:')) {
                throw new common_1.BadRequestException(msg.replace(/^Ozon:\s*/, ''));
            }
            throw new common_1.InternalServerErrorException(`Ошибка проверки подключения: ${msg}`);
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
                throw new common_1.BadRequestException(`Достигнут лимит маркетплейсов (${limits.maxMarketplaces}) по вашему тарифу. Перейдите на другой план в разделе «Подписка».`);
            }
        }
        const data = {
            token: encryptedToken,
            refreshToken: encryptedRefresh,
            sellerId: sid || null,
            warehouseId: warehouseId || null,
            lastError: null,
        };
        if (statsToken !== undefined)
            data.statsToken = encryptedStats;
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
    async disconnect(userId, marketplace) {
        await this.prisma.marketplaceConnection.deleteMany({
            where: { userId, marketplace },
        });
    }
    async updateWarehouse(userId, marketplace, warehouseId) {
        const conn = await this.getMarketplaceConnection(userId, marketplace);
        if (!conn) {
            throw new common_1.BadRequestException(`Сначала подключите ${marketplace}`);
        }
        return this.prisma.marketplaceConnection.update({
            where: { id: conn.id },
            data: { warehouseId: warehouseId?.trim() || null, lastError: null },
        });
    }
    async updateStatsToken(userId, marketplace, statsToken) {
        if (marketplace !== 'WILDBERRIES') {
            throw new common_1.BadRequestException('Дополнительный токен поддерживается только для Wildberries');
        }
        const conn = await this.getMarketplaceConnection(userId, marketplace);
        if (!conn) {
            throw new common_1.BadRequestException('Сначала подключите Wildberries');
        }
        const encrypted = this.crypto.encrypt(statsToken);
        const updated = await this.prisma.marketplaceConnection.update({
            where: { id: conn.id },
            data: { statsToken: encrypted, lastError: null },
        });
        this.eventEmitter.emit('marketplace.wbStatsTokenUpdated', { userId });
        return updated;
    }
    async getUserMarketplaces(userId) {
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
        const byMarketplace = new Map();
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
    async syncProducts(userId, products, marketplaceFilter) {
        const ids = await this.getEffectiveUserIds(userId);
        const where = { userId: { in: ids } };
        if (marketplaceFilter) {
            where.marketplace = marketplaceFilter;
        }
        const allConnections = await this.prisma.marketplaceConnection.findMany({ where });
        const byMarketplace = new Map();
        for (const uid of ids) {
            for (const c of allConnections) {
                if (c.userId === uid && !byMarketplace.has(c.marketplace)) {
                    byMarketplace.set(c.marketplace, c);
                }
            }
        }
        const connections = Array.from(byMarketplace.values());
        const results = [];
        for (const conn of connections) {
            if (!conn.token)
                continue;
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
                const result = await withRetry(() => adapter.syncProducts(productsToSync), `syncProducts ${conn.marketplace}`);
                results.push({ marketplace: conn.marketplace, ...result });
                if (result.createdMappings?.length) {
                    for (const m of result.createdMappings) {
                        await this.productMappingService.upsertMapping(m.productId, userId, conn.marketplace, m.externalSystemId, conn.marketplace === 'OZON' && m.externalArticle
                            ? { externalArticle: m.externalArticle }
                            : undefined);
                        await this.saveBarcodeFromMarketplace(userId, m.productId, conn.marketplace, m.externalSystemId);
                    }
                }
                await this.prisma.marketplaceConnection.update({
                    where: { id: conn.id },
                    data: { lastSyncAt: new Date(), lastError: null },
                });
            }
            catch (error) {
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
    async saveBarcodeFromMarketplace(userId, productId, marketplace, externalSystemId) {
        const conn = await this.getMarketplaceConnection(userId, marketplace);
        if (!conn?.token)
            return;
        const adapter = this.adapterFactory.createAdapter(marketplace, {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            encryptedStatsToken: conn.statsToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        try {
            if (marketplace === 'WILDBERRIES' && adapter instanceof wildberries_adapter_1.WildberriesAdapter) {
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
            }
            else if (marketplace === 'OZON' && adapter instanceof ozon_adapter_1.OzonAdapter) {
                const product = await this.productsService.findById(userId, productId);
                const offerId = product ? (product.article ?? product.sku ?? '').toString().trim() : undefined;
                let barcode = null;
                for (let attempt = 0; attempt < 3; attempt++) {
                    barcode = await adapter.getBarcodeByProductId(externalSystemId, offerId || undefined);
                    if (barcode)
                        break;
                    if (attempt < 2)
                        await new Promise((r) => setTimeout(r, 3000));
                }
                if (barcode) {
                    await this.prisma.product.update({
                        where: { id: productId },
                        data: { barcodeOzon: barcode },
                    });
                }
            }
        }
        catch (err) {
            console.warn(`[MarketplacesService] saveBarcodeFromMarketplace ${marketplace}:`, err);
        }
    }
    async enrichProductsWithMarketplaceMappings(userIds, products, marketplace) {
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
            if (!m)
                return p;
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
            if (marketplace === 'YANDEX')
                return { ...p, yandexProductId: extId };
            if (marketplace === 'AVITO')
                return { ...p, avitoProductId: extId };
            return p;
        });
    }
    async pushOrderStatus(userId, marketplace, payload) {
        const conn = await this.getMarketplaceConnection(userId, marketplace);
        if (!conn?.token) {
            throw new common_1.BadRequestException(`Нет подключения к ${marketplace}. Подключите маркетплейс в настройках.`);
        }
        const adapter = this.adapterFactory.createAdapter(marketplace, {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            encryptedStatsToken: conn.statsToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter) {
            throw new common_1.BadRequestException(`Адаптер ${marketplace} не найден.`);
        }
        let wbSupplyId;
        if (marketplace === 'WILDBERRIES' &&
            payload.wbFulfillmentType === 'FBS' &&
            adapter instanceof wildberries_adapter_1.WildberriesAdapter) {
            const supply = await this.wbSupplyService.getOrCreateActiveSupply(userId, adapter);
            wbSupplyId = supply.wbSupplyId;
        }
        const ok = await adapter.updateOrderStatus(payload.marketplaceOrderId, payload.status, {
            wbStickerNumber: payload.wbStickerNumber,
            wbFulfillmentType: payload.wbFulfillmentType,
            wbSupplyId,
        });
        if (!ok) {
            throw new common_1.BadRequestException(`Не удалось передать статус на ${marketplace}. Проверьте логи или обратитесь в поддержку.`);
        }
    }
    async getWbAdapterAndSupply(userId) {
        const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
        if (!conn?.token) {
            throw new common_1.BadRequestException('Нет подключения к Wildberries. Подключите маркетплейс в настройках.');
        }
        const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            encryptedStatsToken: conn.statsToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof wildberries_adapter_1.WildberriesAdapter)) {
            throw new common_1.BadRequestException('Адаптер Wildberries не найден.');
        }
        const supply = await this.wbSupplyService.getOrCreateActiveSupply(userId, adapter);
        return { adapter, supplyId: supply.wbSupplyId };
    }
    async getWbSupplyInfo(userId) {
        const { adapter, supplyId } = await this.getWbAdapterAndSupply(userId);
        const trbxes = await adapter.getSupplyTrbx(supplyId);
        return { supplyId, trbxes };
    }
    async addWbTrbx(userId, amount) {
        const { adapter, supplyId } = await this.getWbAdapterAndSupply(userId);
        const trbxIds = await adapter.addTrbxToSupply(supplyId, Math.min(Math.max(1, amount), 1000));
        return { trbxIds };
    }
    async getWbTrbxStickers(userId, type = 'png') {
        const { adapter, supplyId } = await this.getWbAdapterAndSupply(userId);
        const trbxes = await adapter.getSupplyTrbx(supplyId);
        const trbxIds = trbxes.map((t) => t.id);
        if (trbxIds.length === 0) {
            throw new common_1.BadRequestException('Нет грузомест. Сначала создайте коробки в поставке.');
        }
        const stickers = await adapter.getTrbxStickers(supplyId, trbxIds, type);
        return { supplyId, stickers };
    }
    async deliverWbSupply(userId) {
        const { adapter, supplyId } = await this.getWbAdapterAndSupply(userId);
        const ok = await adapter.deliverSupply(supplyId);
        if (ok) {
            await this.prisma.wbSupply.updateMany({
                where: { userId, wbSupplyId: supplyId },
                data: { status: 'DELIVERED', updatedAt: new Date() },
            });
            return { ok: true };
        }
        return { ok: false, message: 'Не удалось сдать поставку в доставку' };
    }
    async getWbSupplyBarcode(userId, type = 'png') {
        const supply = await this.prisma.wbSupply.findFirst({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
        });
        if (!supply) {
            throw new common_1.BadRequestException('Нет активной поставки. Сначала добавьте заказы и сдайте в доставку.');
        }
        const conn = await this.getMarketplaceConnection(userId, 'WILDBERRIES');
        if (!conn?.token)
            throw new common_1.BadRequestException('Нет подключения к Wildberries.');
        const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            encryptedStatsToken: conn.statsToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof wildberries_adapter_1.WildberriesAdapter)) {
            throw new common_1.BadRequestException('Адаптер Wildberries не найден.');
        }
        return adapter.getSupplyBarcode(supply.wbSupplyId, type);
    }
    async getOrdersFromAllMarketplaces(userId, since) {
        const ids = await this.getEffectiveUserIds(userId);
        const connections = await this.prisma.marketplaceConnection.findMany({
            where: { userId: { in: ids } },
        });
        const byMarketplace = new Map();
        for (const uid of ids) {
            for (const c of connections) {
                if (c.userId === uid && !byMarketplace.has(c.marketplace)) {
                    byMarketplace.set(c.marketplace, c);
                }
            }
        }
        const connections_merged = Array.from(byMarketplace.values());
        const allOrders = [];
        for (const conn of connections_merged) {
            if (!conn.token)
                continue;
            const adapter = this.adapterFactory.createAdapter(conn.marketplace, {
                encryptedToken: conn.token,
                encryptedStatsToken: conn.statsToken,
                sellerId: conn.sellerId ?? undefined,
                warehouseId: conn.warehouseId ?? undefined,
            });
            if (!adapter)
                continue;
            try {
                const orders = await withRetry(() => adapter.getOrders(since), `getOrders ${conn.marketplace}`);
                allOrders.push(...orders.map((o) => ({ ...o, marketplace: conn.marketplace })));
            }
            catch (error) {
                console.error(`[MarketplacesService] Ошибка получения заказов с ${conn.marketplace} (после ${RETRY_ATTEMPTS} попыток):`, error);
            }
        }
        return allOrders;
    }
    async getOrdersStatsByMarketplace(userId, from, to) {
        const ids = await this.getEffectiveUserIds(userId);
        const now = new Date();
        const fromDate = from ?? new Date(now.getFullYear(), now.getMonth(), 1);
        const toDate = to ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const rows = await this.prisma.$queryRaw `
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
      WHERE user_id IN (${client_1.Prisma.join(ids)})
        AND created_at >= ${fromDate}
        AND created_at <= ${toDate}
      GROUP BY marketplace
    `;
        const result = {};
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
    async syncOrderCosts(userId, from, to) {
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
        const byMarketplace = new Map();
        for (const o of deliveredOrders) {
            const list = byMarketplace.get(o.marketplace) ?? [];
            list.push(o);
            byMarketplace.set(o.marketplace, list);
        }
        const errors = [];
        let updated = 0;
        for (const [marketplace, orders] of byMarketplace) {
            const conn = await this.getMarketplaceConnection(userId, marketplace);
            if (!conn?.token)
                continue;
            const adapter = this.adapterFactory.createAdapter(marketplace, {
                encryptedToken: conn.token,
                encryptedRefreshToken: conn.refreshToken ?? undefined,
                encryptedStatsToken: conn.statsToken ?? undefined,
                sellerId: conn.sellerId ?? undefined,
                warehouseId: conn.warehouseId ?? undefined,
            });
            if (!adapter)
                continue;
            try {
                if (marketplace === 'WILDBERRIES') {
                    const wbAdapter = adapter;
                    if (typeof wbAdapter.getOrderCostsFromReport !== 'function')
                        continue;
                    const costsMap = await wbAdapter.getOrderCostsFromReport(fromDate, toDate);
                    for (const order of orders) {
                        const costs = costsMap.get(order.externalId);
                        if (!costs)
                            continue;
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
                else if (marketplace === 'OZON') {
                    const ozonAdapter = adapter;
                    if (typeof ozonAdapter.getOrderCostsFromFinance !== 'function')
                        continue;
                    const costsMap = await ozonAdapter.getOrderCostsFromFinance(fromDate, toDate);
                    for (const order of orders) {
                        const postingNumber = order.ozonPostingNumber ?? order.externalId;
                        const costs = costsMap.get(postingNumber);
                        if (!costs)
                            continue;
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
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                errors.push(`${marketplace}: ${msg}`);
            }
        }
        return { updated, errors };
    }
    async getLinkedProductsStats(userId) {
        const ids = await this.getEffectiveUserIds(userId);
        const linkedByMp = new Map();
        const allProductIds = new Set();
        const mappings = await this.prisma.productMarketplaceMapping.findMany({
            where: { userId: { in: ids }, isActive: true },
            select: { productId: true, marketplace: true },
        });
        for (const m of mappings) {
            const key = m.marketplace.toLowerCase();
            if (!linkedByMp.has(key))
                linkedByMp.set(key, new Set());
            linkedByMp.get(key).add(m.productId);
            allProductIds.add(m.productId);
        }
        const legacyProducts = await this.prisma.product.findMany({
            where: {
                userId: { in: ids },
                sku: { not: null },
                archivedAt: null,
            },
            select: { id: true, sku: true, marketplaceMappings: { where: { isActive: true }, select: { marketplace: true } } },
        });
        const wbSkuRegex = /^WB-[^-]+-[0-9]+$/;
        const legacyPatterns = [
            { pattern: wbSkuRegex, key: 'wildberries' },
            { pattern: (s) => s.startsWith('OZ-'), key: 'ozon' },
            { pattern: (s) => s.startsWith('YM-'), key: 'yandex' },
            { pattern: (s) => s.startsWith('AV-'), key: 'avito' },
        ];
        for (const p of legacyProducts) {
            const sku = p.sku ?? '';
            const hasMapping = (mp) => p.marketplaceMappings.some((m) => m.marketplace.toLowerCase() === mp);
            for (const { pattern, key } of legacyPatterns) {
                const matches = typeof pattern === 'function' ? pattern(sku) : pattern.test(sku);
                if (!matches || hasMapping(key))
                    continue;
                if (!linkedByMp.has(key))
                    linkedByMp.set(key, new Set());
                linkedByMp.get(key).add(p.id);
                allProductIds.add(p.id);
            }
        }
        const orderItems = await this.prisma.orderItem.findMany({
            where: { order: { userId: { in: ids } } },
            select: { productId: true, order: { select: { marketplace: true } } },
        });
        for (const item of orderItems) {
            if (!item.productId || !item.order?.marketplace)
                continue;
            const key = item.order.marketplace.toLowerCase();
            if (!linkedByMp.has(key))
                linkedByMp.set(key, new Set());
            linkedByMp.get(key).add(item.productId);
            allProductIds.add(item.productId);
        }
        const byMarketplace = {};
        for (const [key, set] of linkedByMp) {
            byMarketplace[key] = set.size;
        }
        return { byMarketplace, totalUnique: allProductIds.size };
    }
    async getStatistics(userId) {
        const ids = await this.getEffectiveUserIds(userId);
        const allConns = await this.prisma.marketplaceConnection.findMany({
            where: { userId: { in: ids } },
        });
        const byMarketplace = new Map();
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
                .filter((conn) => conn.token)
                .map(async (conn) => {
                const adapter = this.adapterFactory.createAdapter(conn.marketplace, {
                    encryptedToken: conn.token,
                    sellerId: conn.sellerId ?? undefined,
                    warehouseId: conn.warehouseId ?? undefined,
                });
                if (!adapter)
                    return null;
                try {
                    const stats = await adapter.getStatistics();
                    return { marketplace: conn.marketplace.toLowerCase(), stats };
                }
                catch (error) {
                    console.error(`[MarketplacesService] Ошибка получения статистики с ${conn.marketplace}:`, error);
                    return null;
                }
            }),
        ]);
        const linkedByMp = new Map();
        const allProductIds = new Set();
        for (const m of mappings) {
            const key = m.marketplace.toLowerCase();
            if (!linkedByMp.has(key))
                linkedByMp.set(key, new Set());
            linkedByMp.get(key).add(m.productId);
            allProductIds.add(m.productId);
        }
        const statistics = {};
        for (const result of adapterStats) {
            if (!result)
                continue;
            const { marketplace, stats } = result;
            statistics[marketplace] = {
                ...stats,
                linkedProductsCount: linkedByMp.get(marketplace)?.size ?? 0,
            };
        }
        for (const conn of connections) {
            const key = conn.marketplace.toLowerCase();
            if (statistics[key])
                continue;
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
    async getWbStockForProduct(userId, displayId) {
        const product = await this.productsService.findByArticleOrId(userId, displayId);
        if (!product) {
            throw new common_1.BadRequestException('Товар не найден');
        }
        let nmId = await this.productMappingService.getWbNmId(product.id, userId);
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
            throw new common_1.BadRequestException('Wildberries не подключён');
        }
        const adapter = this.adapterFactory.createAdapter('WILDBERRIES', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof wildberries_adapter_1.WildberriesAdapter)) {
            throw new common_1.BadRequestException('Ошибка доступа к WB');
        }
        const stocks = await adapter.getStocks([nmId]);
        const wbStock = stocks[nmId] ?? 0;
        const chrtIds = await adapter.getChrtIdsForNmId(nmId);
        const hint = chrtIds.length <= 1 && product.stock !== wbStock
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
    async forceSyncWbStock(userId, displayIdOrArticle) {
        const product = await this.productsService.findByArticleOrId(userId, displayIdOrArticle);
        if (!product)
            throw new common_1.BadRequestException('Товар не найден');
        let nmId = await this.productMappingService.getWbNmId(product.id, userId);
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
                price: Number(product.price),
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
    async getWbBarcodeForProduct(userId, productId) {
        const product = await this.productsService.findById(userId, productId);
        if (!product) {
            throw new common_1.BadRequestException('Товар не найден');
        }
        let nmId = await this.productMappingService.getWbNmId(product.id, userId);
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
        if (!adapter || !(adapter instanceof wildberries_adapter_1.WildberriesAdapter)) {
            return { error: 'Ошибка доступа к WB' };
        }
        const barcode = await adapter.getBarcodeByNmId(nmId);
        return barcode ? { barcode } : { error: 'Штрих-код не найден в WB' };
    }
    async loadAndSaveWbBarcode(userId, productId) {
        const result = await this.getWbBarcodeForProduct(userId, productId);
        if ('error' in result)
            return result;
        await this.prisma.product.update({
            where: { id: productId },
            data: { barcodeWb: result.barcode },
        });
        return result;
    }
    async loadAndSaveOzonBarcode(userId, productIdOrArticle) {
        const product = await this.productsService.findByArticleOrId(userId, productIdOrArticle);
        if (!product)
            throw new common_1.BadRequestException('Товар не найден');
        const ids = await this.getEffectiveUserIds(userId);
        const ozonMapping = await this.productMappingService.getOzonMappingForUserIds(product.id, ids, (product.article ?? '').toString().trim());
        const ozonProductId = (ozonMapping?.externalSystemId ?? '').toString().trim() || null;
        const offerId = (ozonMapping?.externalArticle ?? product.article ?? product.sku ?? '').toString().trim();
        if (!ozonProductId && !offerId)
            return { error: 'Товар не привязан к Ozon и артикул не указан' };
        const conn = await this.getMarketplaceConnection(userId, 'OZON');
        if (!conn?.token)
            return { error: 'Ozon не подключён' };
        const adapter = this.adapterFactory.createAdapter('OZON', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter))
            return { error: 'Ошибка доступа к Ozon' };
        let barcode = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            barcode = await adapter.getBarcodeByProductId(ozonProductId ?? '', offerId || undefined);
            if (barcode)
                break;
            if (attempt === 0 && ozonProductId) {
                await adapter.generateBarcodes([ozonProductId]);
                await new Promise((r) => setTimeout(r, 3000));
            }
            else if (attempt < 3) {
                await new Promise((r) => setTimeout(r, 2500));
            }
        }
        if (!barcode)
            return { error: 'Штрих-код не найден в Ozon. Проверьте артикул (должен совпадать с offer_id на Ozon).' };
        await this.prisma.product.update({
            where: { id: product.id },
            data: { barcodeOzon: barcode },
        });
        return { barcode };
    }
    async getOzonCategoryTree(userId) {
        const conn = await this.getMarketplaceConnection(userId, 'OZON');
        if (!conn?.token)
            throw new common_1.BadRequestException('Ozon не подключён. Подключите в разделе Маркетплейсы.');
        const adapter = this.adapterFactory.createAdapter('OZON', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter)) {
            throw new common_1.BadRequestException('Ошибка доступа к Ozon');
        }
        return adapter.getCategoryTree();
    }
    async getOzonWarehouseList(userId) {
        const conn = await this.getMarketplaceConnection(userId, 'OZON');
        if (!conn?.token)
            throw new common_1.BadRequestException('Ozon не подключён. Подключите в разделе Маркетплейсы.');
        const adapter = this.adapterFactory.createAdapter('OZON', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter)) {
            throw new common_1.BadRequestException('Ошибка доступа к Ozon');
        }
        return adapter.getWarehouseList();
    }
    async getOzonCategoryAttributes(userId, descriptionCategoryId, typeId) {
        const conn = await this.getMarketplaceConnection(userId, 'OZON');
        if (!conn?.token)
            throw new common_1.BadRequestException('Ozon не подключён.');
        const adapter = this.adapterFactory.createAdapter('OZON', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter)) {
            throw new common_1.BadRequestException('Ошибка доступа к Ozon');
        }
        return adapter.getCategoryAttributes(descriptionCategoryId, typeId);
    }
    validateProductForOzon(product) {
        const errors = [];
        if (!product.title?.trim())
            errors.push('Укажите название товара');
        if (!product.imageUrl?.trim() || !product.imageUrl.startsWith('http'))
            errors.push('Добавьте URL фото товара (Ozon требует хотя бы одно изображение)');
        const price = typeof product.price === 'number' ? product.price : Number(product.price);
        if (isNaN(price) || price <= 0)
            errors.push('Укажите цену больше 0 (Ozon не принимает нулевую цену)');
        const article = (product.article ?? product.sku ?? '').toString().trim();
        if (!article)
            errors.push('Укажите артикул (offer_id) — обязателен для Ozon');
        const catId = product.ozonCategoryId != null ? Number(product.ozonCategoryId) : NaN;
        const typeId = product.ozonTypeId != null ? Number(product.ozonTypeId) : NaN;
        if (isNaN(catId) || catId <= 0 || isNaN(typeId) || typeId <= 0)
            errors.push('Выберите категорию Ozon (третий уровень категории)');
        const weight = product.weight != null ? Number(product.weight) : NaN;
        if (isNaN(weight) || weight <= 0)
            errors.push('Укажите вес в граммах (Ozon: weight)');
        const width = product.width != null ? Number(product.width) : NaN;
        if (isNaN(width) || width <= 0)
            errors.push('Укажите ширину в мм (Ozon: width)');
        const lengthVal = product.length != null ? Number(product.length) : NaN;
        if (isNaN(lengthVal) || lengthVal <= 0)
            errors.push('Укажите длину в мм (Ozon: depth)');
        const height = product.height != null ? Number(product.height) : NaN;
        if (isNaN(height) || height <= 0)
            errors.push('Укажите высоту в мм (Ozon: height)');
        return { valid: errors.length === 0, errors };
    }
    async getOzonProductCheck(userId, productIdOrArticle) {
        const product = await this.productsService.findByIdWithMappingsByArticleOrId(userId, productIdOrArticle);
        if (!product)
            throw new common_1.BadRequestException('Товар не найден');
        const ids = await this.getEffectiveUserIds(userId);
        const ozonMapping = await this.productMappingService.getOzonMappingForUserIds(product.id, ids, (product.article ?? '').toString().trim());
        const ozonProductId = ozonMapping?.externalSystemId ?? null;
        const offerIdFromMapping = ozonMapping?.externalArticle?.trim() || null;
        const offerIdFromProduct = (product.article ?? product.sku ?? '').toString().trim() || null;
        const offerIdsToTry = [...new Set([offerIdFromMapping, offerIdFromProduct].filter((x) => !!x))];
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
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter)) {
            return { exists: false, hint: 'Ошибка доступа к Ozon' };
        }
        let ozonInfo = ozonProductId ? await adapter.getProductInfoByProductId(ozonProductId) : null;
        let foundByOfferId = false;
        if (!ozonInfo && offerIdsToTry.length > 0) {
            for (const offerId of offerIdsToTry) {
                if (!offerId)
                    continue;
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
            await this.productMappingService.updateOzonMappingForUserIds(product.id, ids, actualProductId, actualOfferId || (product.article ?? '').toString().trim());
        }
        const bc = ozonInfo.barcodes;
        const barcodeVal = (Array.isArray(bc) && bc.length > 0
            ? (typeof bc[0] === 'string' ? bc[0] : bc[0]?.barcode)
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
    async getOzonStockForProduct(userId, displayIdOrArticle) {
        const product = await this.productsService.findByArticleOrId(userId, displayIdOrArticle);
        if (!product)
            throw new common_1.BadRequestException('Товар не найден');
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
            ozonProductId: check.ozonProductId,
            offer_id: check.offer_id,
            warehouseId: conn.warehouseId ?? null,
            warehouseConfigured: !!conn.warehouseId?.trim(),
            ...(!check.exists && { error: check.hint }),
        };
    }
    async deleteOzonMapping(userId, productIdOrArticle, externalSystemId) {
        const product = await this.productsService.findByArticleOrId(userId, productIdOrArticle);
        if (!product)
            return { success: false, error: 'Товар не найден' };
        const ids = await this.getEffectiveUserIds(userId);
        const deleted = await this.productMappingService.deleteMapping(product.id, ids, 'OZON', externalSystemId.trim());
        if (!deleted)
            return { success: false, error: 'Связка не найдена' };
        return { success: true };
    }
    async refreshOzonMapping(userId, productIdOrArticle) {
        const product = await this.productsService.findByArticleOrId(userId, productIdOrArticle);
        if (!product)
            return { success: false, error: 'Товар не найден' };
        const article = (product.article ?? product.sku ?? '').toString().trim();
        if (!article)
            return { success: false, error: 'Укажите артикул товара' };
        const conn = await this.getMarketplaceConnection(userId, 'OZON');
        if (!conn?.token)
            return { success: false, error: 'Ozon не подключён' };
        const adapter = this.adapterFactory.createAdapter('OZON', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter)) {
            return { success: false, error: 'Ошибка доступа к Ozon' };
        }
        const ozonInfo = await adapter.getProductInfoByOfferId(article);
        if (!ozonInfo?.id) {
            return { success: false, error: `Товар с артикулом «${article}» не найден на Ozon. Создайте его или проверьте артикул.` };
        }
        const newProductId = String(ozonInfo.id);
        const newOfferId = (ozonInfo.offer_id ?? article).toString().trim();
        const ids = await this.getEffectiveUserIds(userId);
        const updated = await this.productMappingService.updateOzonMappingForUserIds(product.id, ids, newProductId, newOfferId);
        if (!updated) {
            await this.productMappingService.upsertMapping(product.id, userId, 'OZON', newProductId, {
                externalArticle: newOfferId,
            });
        }
        return { success: true, product_id: newProductId, offer_id: newOfferId };
    }
    async forceSyncOzonStock(userId, displayIdOrArticle) {
        const ids = await this.getEffectiveUserIds(userId);
        let product = null;
        for (const uid of ids) {
            product = await this.productsService.findByArticleOrId(uid, displayIdOrArticle);
            if (product)
                break;
        }
        if (!product)
            throw new common_1.BadRequestException('Товар не найден');
        const ozonProductId = await this.productMappingService.getExternalIdForUserIds(product.id, ids, 'OZON');
        if (!ozonProductId) {
            return { ok: false, message: 'Товар не привязан к Ozon' };
        }
        const results = await this.syncProducts(userId, [
            {
                id: product.id,
                name: product.title,
                price: Number(product.price),
                stock: product.stock,
                images: product.imageUrl ? [product.imageUrl] : [],
                ozonProductId,
                vendorCode: (product.article ?? product.sku ?? '').toString().trim() || undefined,
            },
        ], 'OZON');
        const r = results[0];
        return {
            ok: r?.success ?? false,
            message: r?.success ? `Остаток ${product.stock} отправлен на Ozon` : (r?.errors?.[0] ?? 'Ошибка синхронизации'),
        };
    }
    async ozonStockDebugStepByStep(userId, displayIdOrArticle) {
        const result = {};
        const ids = await this.getEffectiveUserIds(userId);
        let product = null;
        for (const uid of ids) {
            product = await this.productsService.findByArticleOrId(uid, displayIdOrArticle);
            if (product)
                break;
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
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter)) {
            result.step3_error = 'Ошибка создания адаптера Ozon';
            return result;
        }
        const offerId = mapping.externalArticle?.trim() || (product.article ?? product.sku ?? '').toString().trim() || null;
        const productId = mapping.externalSystemId;
        try {
            const stocks = await adapter.getProductStocks(offerId ? [offerId] : []);
            result.step4_getStocks = {
                request: { filter: { visibility: 'ALL', offer_id: offerId ? [offerId] : [] } },
                response: stocks,
                status: 200,
            };
        }
        catch (err) {
            result.step4_error = err instanceof Error ? err.message : String(err);
        }
        if (offerId && productId) {
            try {
                const setResult = await adapter.setStockWithResponse(offerId, productId, product.stock);
                result.step5_setStock = setResult;
            }
            catch (err) {
                result.step5_error = err instanceof Error ? err.message : String(err);
            }
        }
        else {
            result.step5_error = `offer_id или product_id не указаны. offer_id=${offerId ?? 'null'}, product_id=${productId ?? 'null'}`;
        }
        return result;
    }
    async getOzonOfferIdByProductId(userId, ozonProductId) {
        const conn = await this.getMarketplaceConnection(userId, 'OZON');
        if (!conn?.token)
            return null;
        const adapter = this.adapterFactory.createAdapter('OZON', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter))
            return null;
        const info = await adapter.getProductInfoByProductId(ozonProductId);
        const offerId = (info?.offer_id ?? '').toString().trim();
        return offerId || null;
    }
    async testOzonConnection(userId) {
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
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter)) {
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
        }
        catch (err) {
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
    async getOzonProductDebug(userId, productId) {
        const product = await this.productsService.findByIdWithMappings(userId, productId);
        if (!product)
            throw new common_1.BadRequestException('Товар не найден');
        const ids = await this.getEffectiveUserIds(userId);
        const ozonMapping = await this.productMappingService.getOzonMappingForUserIds(product.id, ids, (product.article ?? '').toString().trim());
        const ozonProductId = (ozonMapping?.externalSystemId ?? '').toString().trim() || null;
        if (!ozonProductId)
            return { error: 'Товар не привязан к Ozon' };
        const conn = await this.getMarketplaceConnection(userId, 'OZON');
        if (!conn?.token)
            return { error: 'Ozon не подключён' };
        const adapter = this.adapterFactory.createAdapter('OZON', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter))
            return { error: 'Ошибка доступа к Ozon' };
        const ozonInfo = await adapter.getProductInfoByProductId(ozonProductId);
        const ozonOfferId = (ozonInfo?.offer_id ?? '').toString().trim() || null;
        const syncVendorCode = ozonMapping?.externalArticle?.trim() || (product.article ?? product.sku ?? '').toString().trim() || null;
        const match = !!syncVendorCode && !!ozonOfferId && syncVendorCode === ozonOfferId;
        return {
            productName: product.title,
            handyseller: {
                productId: product.id,
                displayId: String(product.displayId).padStart(4, '0'),
                article: product.article ?? null,
                sku: product.sku ?? null,
            },
            mapping: {
                externalSystemId: ozonProductId,
                externalArticle: ozonMapping?.externalArticle ?? null,
            },
            ozon: {
                product_id: ozonProductId,
                offer_id: ozonOfferId,
                name: ozonInfo?.name ?? null,
                barcode: ozonInfo?.barcode ?? null,
                barcodes: ozonInfo?.barcodes ?? null,
            },
            barcodes: {
                barcodeWb: product.barcodeWb ?? null,
                barcodeOzon: product.barcodeOzon ?? null,
            },
            syncWillUseOfferId: syncVendorCode,
            match,
            allMappings: await this.prisma.productMarketplaceMapping.findMany({
                where: { productId: product.id, isActive: true },
                select: { userId: true, marketplace: true, externalSystemId: true, externalArticle: true, syncStock: true },
            }),
            effectiveUserIds: ids,
        };
    }
    async getOzonExportDiagnostic(userId, productId) {
        const product = await this.productsService.findByIdWithMappings(userId, productId);
        if (!product)
            throw new common_1.BadRequestException('Товар не найден');
        const validation = this.validateProductForOzon(product);
        if (!validation.valid) {
            return { success: false, error: validation.errors.join('; '), validationErrors: validation.errors };
        }
        const conn = await this.getMarketplaceConnection(userId, 'OZON');
        if (!conn?.token) {
            return { success: false, error: 'Ozon не подключён. Подключите в разделе Маркетплейсы.' };
        }
        const canonical = (0, canonical_1.productToCanonical)(product);
        canonical.barcode = product.barcodeOzon ?? undefined;
        const productData = (0, canonical_1.canonicalToProductData)(canonical, {
            barcodeOzon: product.barcodeOzon,
        });
        const adapter = this.adapterFactory.createAdapter('OZON', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter)) {
            return { success: false, error: 'Ошибка доступа к Ozon' };
        }
        const result = await adapter.tryImportWithFullResponse(productData);
        if (result.success && result.productId) {
            await this.productMappingService.upsertMapping(productId, userId, 'OZON', result.productId, productData.vendorCode ? { externalArticle: productData.vendorCode } : undefined);
            await this.saveBarcodeFromMarketplace(userId, productId, 'OZON', result.productId);
        }
        return result;
    }
    async getOzonExportPreview(userId, productId) {
        const product = await this.productsService.findByIdWithMappings(userId, productId);
        if (!product)
            throw new common_1.BadRequestException('Товар не найден');
        const conn = await this.getMarketplaceConnection(userId, 'OZON');
        if (!conn?.token) {
            return { error: 'Ozon не подключён. Подключите в разделе Маркетплейсы.' };
        }
        const canonical = (0, canonical_1.productToCanonical)(product);
        canonical.barcode = product.barcodeOzon ?? undefined;
        const productData = (0, canonical_1.canonicalToProductData)(canonical, {
            barcodeOzon: product.barcodeOzon,
        });
        const adapter = this.adapterFactory.createAdapter('OZON', {
            encryptedToken: conn.token,
            encryptedRefreshToken: conn.refreshToken,
            sellerId: conn.sellerId ?? undefined,
            warehouseId: conn.warehouseId ?? undefined,
        });
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter)) {
            return { error: 'Ошибка доступа к Ozon' };
        }
        let requiredAttributes = [];
        try {
            const catId = product.ozonCategoryId ?? 17028922;
            const typeId = product.ozonTypeId ?? 91565;
            requiredAttributes = (await adapter.getCategoryAttributes(catId, typeId)).filter((a) => a.is_required);
        }
        catch {
        }
        let payload;
        try {
            payload = adapter.buildImportPayload(productData, requiredAttributes.length > 0 ? requiredAttributes : undefined);
        }
        catch (err) {
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
            timingNote: 'Выгрузка занимает 15–25 сек: импорт (2 сек) → генерация штрихкода (5 сек) → сохранение штрихкода (до 9 сек).',
        };
    }
    async getWbOrderStatus(userId, orderIdOrSrid) {
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
        if (!adapter || !(adapter instanceof wildberries_adapter_1.WildberriesAdapter)) {
            return { error: 'Ошибка доступа к WB' };
        }
        const wbStatus = await adapter.getOrderStatusFromWb(orderIdOrSrid);
        const ourOrder = await this.prisma.order.findFirst({
            where: { userId, marketplace: 'WILDBERRIES', OR: [{ externalId: orderIdOrSrid }, { wbStickerNumber: orderIdOrSrid }] },
            select: { id: true, externalId: true, status: true, rawStatus: true, wbStickerNumber: true },
        });
        const statusFromWb = (wbStatus.wbStatus ?? wbStatus.supplierStatus ?? '').trim();
        const mappedStatus = wbStatus.found && statusFromWb
            ? mapWbStatusToOurs(statusFromWb)
            : null;
        return { wb: wbStatus, ourDb: ourOrder, mappedStatus };
    }
    async getWbOrderSticker(userId, wbOrderId) {
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
        if (!adapter || !(adapter instanceof wildberries_adapter_1.WildberriesAdapter)) {
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
    getDecryptedToken(conn) {
        return {
            token: conn.token ? this.crypto.decrypt(conn.token) : null,
            refreshToken: conn.refreshToken ? this.crypto.decrypt(conn.refreshToken) : null,
        };
    }
    async importProductsFromMarketplace(userId, marketplace) {
        if (marketplace !== 'WILDBERRIES' && marketplace !== 'OZON') {
            throw new common_1.BadRequestException(`Импорт с ${marketplace} пока не поддерживается`);
        }
        const conn = await this.getMarketplaceConnection(userId, marketplace);
        if (!conn?.token) {
            throw new common_1.BadRequestException(`${marketplace === 'OZON' ? 'Ozon' : 'Wildberries'} не подключён. Сначала подключите маркетплейс.`);
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
        if (!adapter || !(adapter instanceof wildberries_adapter_1.WildberriesAdapter)) {
            throw new common_1.BadRequestException('Ошибка загрузки товаров с Wildberries');
        }
        const wbProducts = await withRetry(() => adapter.getProductsFromWb(), 'getProductsFromWb');
        let imported = 0;
        let skipped = 0;
        let articlesUpdated = 0;
        const errors = [];
        for (const p of wbProducts) {
            const sku = `WB-${userId.slice(0, 8)}-${p.nmId}`;
            const existing = await this.productsService.findBySku(userId, sku);
            if (existing) {
                const newTitle = (p.name || `Товар ${p.nmId}`).trim().slice(0, 500);
                const updates = {};
                if (p.vendorCode && existing.article !== p.vendorCode)
                    updates.article = p.vendorCode;
                if (newTitle && existing.title !== newTitle)
                    updates.title = newTitle;
                if (typeof p.description === 'string' && p.description.trim() && existing.description !== p.description.slice(0, 5000))
                    updates.description = p.description.slice(0, 5000);
                if (p.price != null && Number(existing.price) !== p.price)
                    updates.price = p.price;
                if (p.imageUrl != null && existing.imageUrl !== p.imageUrl)
                    updates.imageUrl = p.imageUrl;
                if (p.brand != null && existing.brand !== p.brand)
                    updates.brand = p.brand;
                if (p.color != null && existing.color !== p.color)
                    updates.color = p.color;
                if (p.weight != null && existing.weight !== p.weight)
                    updates.weight = p.weight;
                if (p.width != null && existing.width !== p.width)
                    updates.width = p.width;
                if (p.length != null && existing.length !== p.length)
                    updates.length = p.length;
                if (p.height != null && existing.height !== p.height)
                    updates.height = p.height;
                if (p.itemsPerPack != null && existing.itemsPerPack !== p.itemsPerPack)
                    updates.itemsPerPack = p.itemsPerPack;
                if (p.countryOfOrigin != null && existing.countryOfOrigin !== p.countryOfOrigin)
                    updates.countryOfOrigin = p.countryOfOrigin;
                if (p.material != null && existing.material !== p.material)
                    updates.material = p.material;
                if (p.craftType != null && existing.craftType !== p.craftType)
                    updates.craftType = p.craftType;
                if (p.packageContents != null && existing.packageContents !== p.packageContents)
                    updates.packageContents = p.packageContents;
                if (p.richContent != null && existing.richContent !== p.richContent)
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
                if (!title)
                    continue;
                const created = await this.productsService.create(userId, {
                    title,
                    description: p.description?.slice(0, 5000),
                    price: p.price ?? 0,
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
            }
            catch (err) {
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
    async importFromOzon(userId, conn, adapter) {
        if (!adapter || !(adapter instanceof ozon_adapter_1.OzonAdapter)) {
            throw new common_1.BadRequestException('Ошибка загрузки товаров с Ozon');
        }
        const ozonProducts = await withRetry(() => adapter.getProductsFromOzon(), 'getProductsFromOzon');
        let imported = 0;
        let skipped = 0;
        let articlesUpdated = 0;
        const errors = [];
        for (const p of ozonProducts) {
            const existing = (await this.productMappingService.findProductByExternalId(userId, 'OZON', String(p.productId))) ??
                (await this.productsService.findByArticle(userId, p.offerId));
            if (existing) {
                const updates = {};
                const ex = existing;
                if (p.offerId && existing.article !== p.offerId)
                    updates.article = p.offerId;
                if (p.name && existing.title !== p.name)
                    updates.title = p.name.slice(0, 500);
                if (typeof p.description === 'string' && p.description.trim() && existing.description !== p.description.slice(0, 5000))
                    updates.description = p.description.slice(0, 5000);
                if (p.price != null && Number(existing.price) !== p.price)
                    updates.price = p.price;
                if (p.imageUrl != null && existing.imageUrl !== p.imageUrl)
                    updates.imageUrl = p.imageUrl;
                if (p.barcode != null && existing.barcodeOzon !== p.barcode)
                    updates.barcodeOzon = p.barcode;
                if (p.weight != null && ex.weight !== p.weight)
                    updates.weight = p.weight;
                if (p.width != null && ex.width !== p.width)
                    updates.width = p.width;
                if (p.height != null && ex.height !== p.height)
                    updates.height = p.height;
                if (p.length != null && ex.length !== p.length)
                    updates.length = p.length;
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
                if (!title)
                    continue;
                const created = await this.productsService.create(userId, {
                    title,
                    description: p.description?.slice(0, 5000),
                    price: p.price ?? 0,
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
            }
            catch (err) {
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
};
exports.MarketplacesService = MarketplacesService;
exports.MarketplacesService = MarketplacesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        crypto_service_1.CryptoService,
        marketplace_adapter_factory_1.MarketplaceAdapterFactory,
        products_service_1.ProductsService,
        product_mapping_service_1.ProductMappingService,
        subscriptions_service_1.SubscriptionsService,
        event_emitter_1.EventEmitter2,
        wb_supply_service_1.WbSupplyService])
], MarketplacesService);
//# sourceMappingURL=marketplaces.service.js.map