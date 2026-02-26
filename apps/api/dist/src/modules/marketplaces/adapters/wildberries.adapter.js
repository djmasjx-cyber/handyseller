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
exports.WildberriesAdapter = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const base_marketplace_adapter_1 = require("./base-marketplace.adapter");
const crypto_service_1 = require("../../../common/crypto/crypto.service");
let WildberriesAdapter = class WildberriesAdapter extends base_marketplace_adapter_1.BaseMarketplaceAdapter {
    authHeader(token) {
        const t = token ?? this.config.apiKey;
        const auth = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
        return { Authorization: auth };
    }
    constructor(crypto, httpService, config) {
        super(crypto, {
            ...config,
            baseUrl: config.baseUrl || 'https://seller.wildberries.ru',
        });
        this.CONTENT_API = 'https://content-api.wildberries.ru';
        this.MARKETPLACE_API = 'https://marketplace-api.wildberries.ru';
        this.STATISTICS_API = 'https://statistics-api.wildberries.ru';
        this.PRICES_API = 'https://discounts-prices-api.wildberries.ru';
        this.cachedWarehouseId = null;
        this.chrtIdCache = new Map();
        this.chrtIdsCache = new Map();
        this.httpService = httpService;
    }
    stripHtml(html) {
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    convertToPlatform(canonical) {
        const vendorCode = canonical.vendor_code ?? canonical.canonical_sku;
        const plainDesc = canonical.long_description_plain ?? canonical.short_description ?? '';
        const richDesc = canonical.long_description_html?.trim();
        const descriptionText = richDesc
            ? (plainDesc ? `${plainDesc}\n\n${this.stripHtml(richDesc)}` : this.stripHtml(richDesc))
            : plainDesc;
        const characteristics = [
            { id: 0, name: 'Наименование', value: canonical.title },
            { id: 3, name: 'Описание', value: descriptionText },
        ];
        if (canonical.color?.trim()) {
            characteristics.push({ id: 1, name: 'Цвет', value: canonical.color.trim() });
        }
        if (canonical.items_per_pack != null && canonical.items_per_pack > 0) {
            characteristics.push({ id: 4, name: 'Количество предметов в упаковке', value: String(canonical.items_per_pack) });
        }
        if (canonical.material?.trim()) {
            characteristics.push({ id: 5, name: 'Материал изделия', value: canonical.material.trim() });
        }
        if (canonical.craft_type?.trim()) {
            characteristics.push({ id: 6, name: 'Вид творчества', value: canonical.craft_type.trim() });
        }
        if (canonical.package_contents?.trim()) {
            characteristics.push({ id: 7, name: 'Комплектация', value: canonical.package_contents.trim() });
        }
        if (canonical.attributes?.length) {
            let nextId = 100;
            for (const a of canonical.attributes) {
                const skip = ['Артикул', 'Наименование', 'Описание', 'Цвет', 'Количество предметов в упаковке', 'Материал изделия', 'Вид творчества', 'Комплектация'];
                if (!skip.includes(a.name)) {
                    characteristics.push({ id: nextId++, name: a.name, value: a.value });
                }
            }
        }
        const w = (canonical.width_mm ?? 100) / 10;
        const h = (canonical.height_mm ?? 100) / 10;
        const l = (canonical.length_mm ?? 100) / 10;
        const weightBrutto = (canonical.weight_grams ?? 100) / 1000;
        const card = {
            nomenclature: 0,
            supplierVendorCode: vendorCode,
            countryProduction: canonical.country_of_origin?.trim() || 'Россия',
            brand: canonical.brand_name ?? 'Ручная работа',
            dimensions: { width: w, height: h, length: l, weightBrutto },
            goods: [
                {
                    nomenclature: 0,
                    variant: 0,
                    vendorCode: `${vendorCode}-1`,
                    characteristics,
                    weightBrutto,
                    length: l,
                    width: w,
                    height: h,
                },
            ],
        };
        if (canonical.seo_title || canonical.seo_description || canonical.seo_keywords) {
            card.seoText = {
                title: canonical.seo_title ?? canonical.title,
                description: canonical.seo_description ?? '',
                keywords: canonical.seo_keywords ?? '',
            };
        }
        return { cards: [card] };
    }
    async authenticate() {
        try {
            const res = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.CONTENT_API}/ping`, {
                headers: this.authHeader(),
                timeout: 10000,
            }));
            return res?.data?.Status === 'OK' || res?.status === 200;
        }
        catch (error) {
            const axErr = error;
            const status = axErr?.response?.status;
            const wbMsg = axErr?.response?.data?.detail ?? axErr?.response?.data?.title;
            if (status === 401) {
                console.warn('[WildberriesAdapter] Токен невалиден или истёк. Проверьте токен в ЛК WB.');
            }
            else if (wbMsg || status) {
                console.warn(`[WildberriesAdapter] authenticate: HTTP ${status} — ${wbMsg || ''}`);
            }
            this.logError(error, 'authenticate');
            return false;
        }
    }
    async uploadProduct(product) {
        const canonical = {
            canonical_sku: product.id,
            vendor_code: product.vendorCode ?? product.id,
            title: product.name,
            long_description_plain: product.description,
            brand_name: product.brand,
            weight_grams: product.weight,
            width_mm: product.width,
            length_mm: product.length,
            height_mm: product.height,
            color: product.color,
            items_per_pack: product.itemsPerPack,
            material: product.material,
            craft_type: product.craftType,
            country_of_origin: product.countryOfOrigin,
            package_contents: product.packageContents,
            long_description_html: product.richContent,
            attributes: undefined,
            images: product.images.map((url) => ({ url })),
            price: product.price,
            stock_quantity: product.stock,
        };
        return this.uploadFromCanonical(canonical);
    }
    async uploadFromCanonical(canonical) {
        try {
            const wbProduct = this.convertToPlatform(canonical);
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.CONTENT_API}/content/v2/upload`, wbProduct, {
                headers: {
                    ...this.authHeader(),
                    'Content-Type': 'application/json',
                },
            }));
            if (data?.cards?.[0]) {
                const nmId = Number(data.cards[0].nmID);
                const imageUrls = canonical.images?.map((i) => i.url) ?? [];
                await this.uploadImages(nmId, imageUrls);
                await this.setPrice(nmId, canonical.price);
                if (this.config.sellerId) {
                    await this.setStock(nmId, canonical.stock_quantity);
                }
            }
            return String(data.cards[0].nmID);
        }
        catch (error) {
            this.logError(error, 'uploadProduct');
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Ошибка выгрузки товара на Wildberries: ${msg}`);
        }
    }
    async uploadImages(nmId, images) {
        if (images.length > 0) {
            console.log(`[WildberriesAdapter] Загрузка ${images.length} изображений для товара ${nmId}`);
        }
    }
    async setPrice(nmId, price) {
        try {
            const discount = 0;
            const finalPrice = Math.round(price * (1 + discount / 100));
            await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.PRICES_API}/public/api/v1/prices`, [{ nmId, price: finalPrice, discount }], {
                headers: {
                    ...this.authHeader(),
                    'Content-Type': 'application/json',
                },
            }));
        }
        catch (error) {
            this.logError(error, 'setPrice');
        }
    }
    async getChrtIdByNmId(nmId) {
        const cached = this.chrtIdCache.get(nmId);
        if (cached != null)
            return cached;
        try {
            try {
                const { data: priceData } = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.PRICES_API}/api/v2/list/goods/size/nm`, {
                    params: { nmID: nmId, limit: 10, offset: 0 },
                    headers: this.authHeader(),
                    timeout: 8000,
                }));
                const tryExtract = (item) => {
                    if (!item || typeof item !== 'object')
                        return null;
                    const obj = item;
                    const sizes = (obj?.sizes ?? []);
                    const firstSize = sizes[0];
                    const id = firstSize?.sizeID ?? firstSize?.sizeId;
                    if (id != null)
                        return Number(id);
                    const sizeId = (obj?.sizeID ?? obj?.sizeId);
                    if (sizeId != null && Number(obj?.nmID ?? obj?.nmId) === nmId)
                        return Number(sizeId);
                    return null;
                };
                const raw = priceData?.data ?? priceData;
                const arr = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
                for (const item of arr) {
                    const chrtId = tryExtract(item);
                    if (chrtId != null) {
                        this.chrtIdCache.set(nmId, chrtId);
                        return chrtId;
                    }
                }
            }
            catch (priceErr) {
                if (priceErr?.response?.status !== 404) {
                    this.logError(priceErr, 'getChrtIdByNmId (Prices API)');
                }
            }
            const extractChrtId = (card) => {
                const goods0 = card?.goods?.[0];
                const sizes = ((card?.sizes ?? goods0?.sizes) ?? []);
                const firstSize = sizes[0];
                const id = firstSize?.chrtID ?? firstSize?.chrtId;
                return id != null ? Number(id) : null;
            };
            for (const body of [
                { settings: { cursor: { limit: 100 }, filter: { withPhoto: -1, nmIDs: [nmId] } } },
                { settings: { cursor: { limit: 500 }, filter: { withPhoto: -1 } } },
            ]) {
                const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.CONTENT_API}/content/v2/get/cards/list`, body, { headers: { ...this.authHeader(), 'Content-Type': 'application/json' }, timeout: 10000 }));
                const cards = (data?.cards ?? []);
                const card = cards.find((c) => Number(c?.nmID ?? c?.nmId) === nmId);
                const chrtId = card ? extractChrtId(card) : null;
                if (chrtId != null) {
                    this.chrtIdCache.set(nmId, chrtId);
                    return chrtId;
                }
            }
            return null;
        }
        catch (err) {
            this.logError(err, 'getChrtIdByNmId');
            return null;
        }
    }
    async getChrtIdsByNmId(nmId) {
        const cached = this.chrtIdsCache.get(nmId);
        if (cached != null && cached.length > 0)
            return cached;
        const extractFromItem = (obj) => {
            const sizes = (obj?.sizes ?? []);
            const ids = sizes.map((s) => s?.sizeID ?? s?.sizeId).filter((id) => id != null);
            if (ids.length > 0)
                return ids.map(Number);
            const sizeId = (obj?.sizeID ?? obj?.sizeId);
            if (sizeId != null && Number(obj?.nmID ?? obj?.nmId) === nmId)
                return [Number(sizeId)];
            return [];
        };
        try {
            try {
                const { data: priceData } = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.PRICES_API}/api/v2/list/goods/size/nm`, { params: { nmID: nmId, limit: 50, offset: 0 }, headers: this.authHeader(), timeout: 8000 }));
                const raw = priceData?.data ?? priceData;
                const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
                const allIds = [];
                for (const item of arr) {
                    if (!item || typeof item !== 'object')
                        continue;
                    const ids = extractFromItem(item);
                    for (const id of ids) {
                        if (!allIds.includes(id))
                            allIds.push(id);
                    }
                }
                if (allIds.length > 0) {
                    if (allIds.length > 1)
                        this.chrtIdsCache.set(nmId, allIds);
                    this.chrtIdCache.set(nmId, allIds[0]);
                    return allIds;
                }
            }
            catch {
            }
            const extractFromCard = (card) => {
                const ids = [];
                const add = (id) => {
                    if (id != null && !ids.includes(Number(id)))
                        ids.push(Number(id));
                };
                const sizes = (card?.sizes ?? []);
                for (const s of sizes) {
                    add(s?.chrtID ?? s?.chrtId ?? s?.sizeID ?? s?.sizeId);
                }
                const goods = (card?.goods ?? []);
                for (const g of goods) {
                    add((g?.chrtID ?? g?.chrtId ?? g?.sizeID ?? g?.sizeId));
                    const gSizes = (g?.sizes ?? []);
                    for (const gs of gSizes)
                        add(gs?.chrtID ?? gs?.chrtId);
                }
                const addin = (card?.addin ?? []);
                for (const a of addin) {
                    add((a?.chrtID ?? a?.chrtId ?? a?.sizeID ?? a?.sizeId));
                    const aSizes = (a?.sizes ?? []);
                    for (const as of aSizes)
                        add(as?.chrtID ?? as?.chrtId);
                }
                if (ids.length > 0)
                    return ids;
                const goods0 = card?.goods?.[0];
                const fallbackSizes = ((card?.sizes ?? goods0?.sizes) ?? []);
                return fallbackSizes.map((s) => s?.chrtID ?? s?.chrtId).filter((id) => id != null);
            };
            for (const body of [
                { settings: { cursor: { limit: 100 }, filter: { withPhoto: -1, nmIDs: [nmId] } } },
                { settings: { cursor: { limit: 500 }, filter: { withPhoto: -1 } } },
            ]) {
                const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.CONTENT_API}/content/v2/get/cards/list`, body, { headers: { ...this.authHeader(), 'Content-Type': 'application/json' }, timeout: 10000 }));
                const cards = (data?.cards ?? []);
                const card = cards.find((c) => Number(c?.nmID ?? c?.nmId) === nmId);
                const ids = card ? extractFromCard(card) : [];
                if (ids.length > 0) {
                    if (ids.length > 1)
                        this.chrtIdsCache.set(nmId, ids);
                    this.chrtIdCache.set(nmId, ids[0]);
                    return ids;
                }
            }
            const single = await this.getChrtIdByNmId(nmId);
            if (single != null) {
                this.chrtIdsCache.set(nmId, [single]);
                return [single];
            }
            return [];
        }
        catch (err) {
            this.logError(err, 'getChrtIdsByNmId');
            return [];
        }
    }
    async getBarcodeByNmId(nmId) {
        try {
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.CONTENT_API}/content/v2/get/cards/list`, { settings: { cursor: { limit: 10 }, filter: { withPhoto: -1, nmIDs: [nmId] } } }, { headers: { ...this.authHeader(), 'Content-Type': 'application/json' }, timeout: 10000 }));
            const cards = (data?.cards ?? []);
            const card = cards.find((c) => Number(c?.nmID ?? c?.nmId) === nmId);
            if (!card)
                return null;
            const sizes = (card.sizes ?? card.goods?.[0]?.sizes ?? []);
            const firstSize = sizes[0];
            const skus = firstSize?.skus;
            return Array.isArray(skus) && skus.length > 0 ? String(skus[0]) : null;
        }
        catch (err) {
            this.logError(err, 'getBarcodeByNmId');
            return null;
        }
    }
    async resolveWarehouseId() {
        if (this.config.warehouseId)
            return this.config.warehouseId;
        if (this.cachedWarehouseId)
            return this.cachedWarehouseId;
        for (const path of ['/api/v3/warehouses', '/api/v2/warehouses']) {
            try {
                const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.MARKETPLACE_API}${path}`, {
                    headers: this.authHeader(),
                    timeout: 5000,
                }));
                const list = data?.warehouses ?? (Array.isArray(data) ? data : []);
                const first = list[0];
                const id = first?.id ?? first?.warehouseId ?? first?.id;
                if (id) {
                    this.cachedWarehouseId = String(id);
                    console.log('[WildberriesAdapter] Используем склад из API:', this.cachedWarehouseId);
                    return this.cachedWarehouseId;
                }
            }
            catch (err) {
                if (err?.response?.status !== 404) {
                    this.logError(err, `resolveWarehouseId ${path}`);
                }
            }
        }
        console.warn('[WildberriesAdapter] Склад не найден. Укажите warehouseId при подключении WB (ЛК → Маркетплейс → Мои склады).');
        return null;
    }
    async setStock(nmId, stock) {
        const warehouseId = this.config.warehouseId || this.config.sellerId || (await this.resolveWarehouseId());
        if (!warehouseId) {
            console.warn('[WildberriesAdapter] setStock пропущен: укажите warehouseId при подключении WB (ЛК → Маркетплейс → Мои склады)');
            return;
        }
        const chrtIds = await this.getChrtIdsByNmId(nmId);
        if (chrtIds.length === 0) {
            const msg = `chrtId не найден для nmId=${nmId}. Убедитесь, что товар создан на WB и имеет хотя бы один размер.`;
            console.warn(`[WildberriesAdapter] setStock: ${msg}`);
            throw new Error(msg);
        }
        try {
            const stocks = chrtIds.map((chrtId, i) => ({
                chrtId,
                amount: i === 0 ? stock : 0,
            }));
            const res = await (0, rxjs_1.firstValueFrom)(this.httpService.put(`${this.MARKETPLACE_API}/api/v3/stocks/${warehouseId}`, { stocks }, {
                headers: {
                    ...this.authHeader(),
                    'Content-Type': 'application/json',
                },
            }));
            if (res?.status >= 200 && res?.status < 300) {
            }
        }
        catch (error) {
            const axErr = error;
            const code = axErr?.response?.status;
            const msg = axErr?.response?.data?.message ?? axErr?.response?.data?.code;
            console.error(`[WildberriesAdapter] setStock nmId=${nmId} chrtIds=${chrtIds.length} stock=${stock}: HTTP ${code} — ${msg || ''}`);
            this.logError(error, 'setStock');
            throw error;
        }
    }
    async getChrtIdsForNmId(nmId) {
        return this.getChrtIdsByNmId(nmId);
    }
    async getStocks(nmIds) {
        const warehouseId = this.config.warehouseId || this.config.sellerId || (await this.resolveWarehouseId());
        if (!warehouseId || nmIds.length === 0)
            return {};
        try {
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.MARKETPLACE_API}/api/v3/stocks/${warehouseId}`, { skus: nmIds.map((id) => String(id)) }, {
                headers: {
                    ...this.authHeader(),
                    'Content-Type': 'application/json',
                },
            }));
            const result = {};
            for (const s of data?.stocks ?? []) {
                const nmId = parseInt(s.sku, 10);
                if (!isNaN(nmId))
                    result[nmId] = (result[nmId] ?? 0) + (s.amount ?? 0);
            }
            return result;
        }
        catch (error) {
            this.logError(error, 'getStocks');
            return {};
        }
    }
    async updateProduct(marketplaceProductId, product) {
        try {
            const nmId = Number(marketplaceProductId);
            if (isNaN(nmId))
                return false;
            if (product.price !== undefined)
                await this.setPrice(nmId, product.price);
            if (product.stock !== undefined)
                await this.setStock(nmId, product.stock);
            const hasContentUpdate = product.name != null ||
                product.description != null ||
                product.brand != null ||
                product.weight != null ||
                product.width != null ||
                product.length != null ||
                product.height != null ||
                product.color != null ||
                product.material != null ||
                product.craftType != null ||
                product.countryOfOrigin != null ||
                product.packageContents != null ||
                product.richContent != null ||
                product.itemsPerPack != null;
            if (hasContentUpdate && product.name) {
                try {
                    const plainDesc = (product.description ?? '').trim();
                    const richDesc = (product.richContent ?? '').trim();
                    const descriptionText = richDesc
                        ? (plainDesc ? `${plainDesc}\n\n${this.stripHtml(richDesc)}` : this.stripHtml(richDesc))
                        : plainDesc;
                    const characteristics = [
                        { id: 0, name: 'Наименование', value: product.name.slice(0, 500) },
                        { id: 3, name: 'Описание', value: descriptionText.slice(0, 5000) },
                    ];
                    if (product.color?.trim()) {
                        characteristics.push({ id: 1, name: 'Цвет', value: product.color.trim() });
                    }
                    if (product.itemsPerPack != null && product.itemsPerPack > 0) {
                        characteristics.push({ id: 4, name: 'Количество предметов в упаковке', value: String(product.itemsPerPack) });
                    }
                    if (product.material?.trim()) {
                        characteristics.push({ id: 5, name: 'Материал изделия', value: product.material.trim() });
                    }
                    if (product.craftType?.trim()) {
                        characteristics.push({ id: 6, name: 'Вид творчества', value: product.craftType.trim() });
                    }
                    if (product.packageContents?.trim()) {
                        characteristics.push({ id: 7, name: 'Комплектация', value: product.packageContents.trim() });
                    }
                    const w = (product.width ?? 100) / 10;
                    const h = (product.height ?? 100) / 10;
                    const l = (product.length ?? 100) / 10;
                    const weightBrutto = (product.weight ?? 100) / 1000;
                    const vendorCode = (product.vendorCode ?? product.id ?? `HS-${nmId}`).toString();
                    const card = {
                        nmID: nmId,
                        supplierVendorCode: vendorCode,
                        countryProduction: (product.countryOfOrigin ?? 'Россия').trim(),
                        brand: (product.brand ?? 'Ручная работа').trim(),
                        dimensions: { width: w, height: h, length: l, weightBrutto },
                        goods: [
                            {
                                nomenclature: 0,
                                variant: 0,
                                vendorCode: `${vendorCode}-1`,
                                characteristics,
                                weightBrutto,
                                length: l,
                                width: w,
                                height: h,
                            },
                        ],
                    };
                    await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.CONTENT_API}/content/v2/cards/update`, { cards: [card] }, {
                        headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
                        timeout: 15000,
                        validateStatus: () => true,
                    }));
                }
                catch (contentErr) {
                    this.logError(contentErr, 'updateProduct (content)');
                }
            }
            return true;
        }
        catch (error) {
            this.logError(error, 'updateProduct');
            return false;
        }
    }
    async deleteProduct(marketplaceProductId) {
        console.log(`[WildberriesAdapter] Удаление товара ${marketplaceProductId} с Wildberries`);
        return true;
    }
    async getStickers(orderIds) {
        if (orderIds.length === 0)
            return [];
        try {
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.MARKETPLACE_API}/api/v3/orders/stickers?type=png&width=58&height=40`, { orders: orderIds }, {
                headers: {
                    ...this.authHeader(),
                    'Content-Type': 'application/json',
                },
                timeout: 15000,
            }));
            if (data?.stickers && Array.isArray(data.stickers)) {
                return data.stickers
                    .filter((s) => s.file)
                    .map((s) => ({ orderId: s.orderId ?? orderIds[0], file: s.file }));
            }
            if (data?.file && orderIds.length > 0) {
                return [{ orderId: orderIds[0], file: data.file }];
            }
            return [];
        }
        catch (err) {
            this.logError(err, 'getStickers');
            return [];
        }
    }
    async getOrderStatusFromWb(orderIdOrSrid) {
        const numId = parseInt(orderIdOrSrid, 10);
        const opts = {
            headers: {
                ...this.authHeader(),
                'Content-Type': 'application/json',
            },
            timeout: 10000,
        };
        const parseStatusResponse = (data, id) => {
            const orders = data?.orders ?? [];
            const o = orders[0];
            if (o) {
                return {
                    found: true,
                    orderId: o.id ?? o.orderId ?? id,
                    srid: o.srid,
                    wbStatus: o.wbStatus,
                    supplierStatus: o.supplierStatus,
                    orderStatus: o.orderStatus,
                    raw: o,
                };
            }
            return null;
        };
        const tryStatusById = async (id) => {
            for (const [path, bodyKey, bodyVal] of [
                ['/api/v3/orders/status', 'orders', [id]],
                ['/api/marketplace/v3/dbs/orders/status/info', 'ordersIds', [id]],
            ]) {
                try {
                    const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.MARKETPLACE_API}${path}`, { [bodyKey]: bodyVal }, opts));
                    const res = parseStatusResponse(data, id);
                    if (res)
                        return res;
                }
                catch {
                }
            }
            if (this.config.statsToken) {
                try {
                    const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.MARKETPLACE_API}/api/v3/dbw/orders/status`, { orders: [id] }, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${this.config.statsToken}` } }));
                    const res = parseStatusResponse(data, id);
                    if (res)
                        return res;
                }
                catch {
                }
            }
            return null;
        };
        if (!isNaN(numId)) {
            const res = await tryStatusById(numId);
            if (res)
                return res;
        }
        const orders = await this.getOrders(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        const search = orderIdOrSrid.toLowerCase();
        const match = orders.find((o) => o.id === orderIdOrSrid ||
            o.id === String(numId) ||
            o.marketplaceOrderId === orderIdOrSrid ||
            (o.marketplaceOrderId && o.marketplaceOrderId.toLowerCase().includes(search)));
        if (match) {
            const id = parseInt(match.id, 10);
            if (!isNaN(id)) {
                const res = await tryStatusById(id);
                if (res)
                    return res;
            }
            return {
                found: true,
                orderId: parseInt(match.id, 10),
                srid: match.marketplaceOrderId,
                wbStatus: match.rawStatus,
                orderStatus: match.rawStatus,
                raw: match,
            };
        }
        return { found: false };
    }
    async getOrders(since) {
        const seen = new Set();
        const result = [];
        const dateTo = Math.floor(Date.now() / 1000);
        const defaultSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const dateFrom = Math.floor((since ?? defaultSince).getTime() / 1000);
        const fboToken = this.config.statsToken;
        const toOrder = (o, fulfillmentType) => {
            const id = o.id ?? o.orderId;
            const srid = (o.srid ?? o.id ?? '');
            const status = (o.orderStatus ?? o.supplierStatus ?? o.status ?? 'new');
            const wbStatus = o.wbStatus;
            const priceRaw = o.totalPrice ?? o.price ?? o.convertedPrice ?? 0;
            const amount = (Number(priceRaw) || 0) / 100;
            const dateStr = (o.dateCreated ?? o.createdAt ?? o.date ?? new Date().toISOString());
            const items = (o.items ?? o.nomenclaturas ?? o.positions);
            let nmId = o.nmId ?? o.nmID ?? o.nomenclaturaId ?? 0;
            if (Array.isArray(items) && items.length > 0) {
                nmId = items[0]?.nmId ?? items[0]?.nmID ?? items[0]?.nomenclaturaId ?? nmId;
            }
            const offices = o.offices;
            const warehouseName = Array.isArray(offices) && offices.length > 0 ? offices[0] : undefined;
            const key = `${id}-${srid}-${nmId}`;
            if (seen.has(key))
                return;
            seen.add(key);
            result.push({
                id: String(id),
                marketplaceOrderId: String(srid),
                productId: String(nmId),
                customerName: o.customerName || 'Аноним',
                customerPhone: (o.customerPhone ?? o.clientPhone),
                status: typeof status === 'number' ? String(status) : status,
                amount,
                createdAt: new Date(dateStr),
                warehouseName,
                rawStatus: wbStatus,
                wbFulfillmentType: fulfillmentType,
            });
        };
        const fetchFrom = async (url, params, fulfillmentType, useFboToken) => {
            const token = useFboToken && fboToken ? fboToken : undefined;
            const opts = { headers: this.authHeader(token), timeout: 10000 };
            try {
                const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.get(url, { ...opts, params }));
                for (const o of data?.orders ?? []) {
                    toOrder(o, fulfillmentType);
                }
            }
            catch {
            }
        };
        const fetchStatuses = async (orderIds, statusPath, bodyKey, useFboToken) => {
            const map = new Map();
            if (orderIds.length === 0)
                return map;
            const token = useFboToken && fboToken ? fboToken : undefined;
            for (let i = 0; i < orderIds.length; i += 1000) {
                const batch = orderIds.slice(i, i + 1000);
                try {
                    const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.MARKETPLACE_API}${statusPath}`, { [bodyKey]: batch }, {
                        headers: {
                            ...this.authHeader(token),
                            'Content-Type': 'application/json',
                        },
                        timeout: 10000,
                    }));
                    for (const s of data?.orders ?? []) {
                        const entry = s;
                        const oid = entry.id ?? entry.orderId;
                        if (oid != null) {
                            const prev = map.get(Number(oid)) ?? {};
                            map.set(Number(oid), {
                                ...prev,
                                wbStatus: entry.wbStatus ?? prev.wbStatus,
                                supplierStatus: entry.supplierStatus ?? prev.supplierStatus,
                            });
                        }
                    }
                }
                catch {
                }
            }
            return map;
        };
        try {
            await fetchFrom(`${this.MARKETPLACE_API}/api/v3/orders/new`, undefined, 'FBS');
            await fetchFrom(`${this.MARKETPLACE_API}/api/v3/dbs/orders/new`, undefined, 'DBS');
            await fetchFrom(`${this.MARKETPLACE_API}/api/v3/dbw/orders/new`, undefined, 'DBW', true);
            await fetchFrom(`${this.MARKETPLACE_API}/api/v3/orders`, { dateFrom, dateTo, next: 0, limit: 1000 }, 'FBS');
            await fetchFrom(`${this.MARKETPLACE_API}/api/v3/dbs/orders`, { dateFrom, dateTo, next: 0, limit: 1000 }, 'DBS');
            await fetchFrom(`${this.MARKETPLACE_API}/api/v3/dbw/orders`, { dateFrom, dateTo, next: 0, limit: 1000 }, 'DBW', true);
            const ids = result.map((r) => parseInt(r.id, 10)).filter((n) => !isNaN(n));
            const [fbsMap, dbsMap, dbwMap] = await Promise.all([
                fetchStatuses(ids, '/api/v3/orders/status', 'orders'),
                fetchStatuses(ids, '/api/marketplace/v3/dbs/orders/status/info', 'ordersIds'),
                fetchStatuses(ids, '/api/v3/dbw/orders/status', 'orders', true),
            ]);
            const statusMap = new Map([
                ...fbsMap,
                ...dbsMap,
                ...dbwMap,
            ]);
            for (const od of result) {
                const st = statusMap.get(parseInt(od.id, 10));
                if (st?.wbStatus)
                    od.rawStatus = st.wbStatus;
                if (st?.supplierStatus)
                    od.rawSupplierStatus = st.supplierStatus;
            }
            return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        catch (error) {
            this.logError(error, 'getOrders');
            return [];
        }
    }
    async updateOrderStatus(marketplaceOrderId, status, options) {
        const wbStatus = this.mapStatusToWB(status);
        if (wbStatus !== 2) {
            return true;
        }
        try {
            const numericId = this.resolveWbOrderId(marketplaceOrderId, options?.wbStickerNumber);
            if (numericId == null) {
                this.logError(new Error('WB: не удалось определить числовой id заказа'), 'updateOrderStatus');
                return false;
            }
            if (options?.wbFulfillmentType === 'FBS') {
                if (options.wbSupplyId) {
                    return await this.confirmFbsOrderWithSupply(numericId, options.wbSupplyId);
                }
                return await this.confirmFbsOrder(numericId);
            }
            if (options?.wbFulfillmentType === 'DBS') {
                return await this.confirmDbsOrder(numericId);
            }
            if (options?.wbFulfillmentType === 'DBW') {
                return await this.confirmDbwOrder(numericId);
            }
            return await this.confirmOrderToAssembly(numericId);
        }
        catch (error) {
            this.logError(error, 'updateOrderStatus');
            return false;
        }
    }
    resolveWbOrderId(marketplaceOrderId, wbStickerNumber) {
        const fromSticker = wbStickerNumber ? parseInt(wbStickerNumber, 10) : NaN;
        const fromExternal = parseInt(marketplaceOrderId, 10);
        const id = !isNaN(fromSticker) ? fromSticker : !isNaN(fromExternal) ? fromExternal : null;
        return id != null ? id : null;
    }
    async confirmOrderToAssembly(wbOrderId) {
        const fbsOk = await this.confirmFbsOrder(wbOrderId);
        if (fbsOk)
            return true;
        const dbsOk = await this.confirmDbsOrder(wbOrderId);
        if (dbsOk)
            return true;
        const dbwOk = await this.confirmDbwOrder(wbOrderId);
        return dbwOk;
    }
    async confirmFbsOrder(wbOrderId) {
        try {
            const supplyId = await this.createOrGetActiveSupply();
            if (!supplyId)
                return false;
            return await this.confirmFbsOrderWithSupply(wbOrderId, supplyId);
        }
        catch (error) {
            this.logError(error, 'confirmFbsOrder');
            return false;
        }
    }
    async confirmFbsOrderWithSupply(wbOrderId, supplyId) {
        try {
            await (0, rxjs_1.firstValueFrom)(this.httpService.patch(`${this.MARKETPLACE_API}/api/marketplace/v3/supplies/${encodeURIComponent(supplyId)}/orders`, { orders: [wbOrderId] }, {
                headers: {
                    ...this.authHeader(),
                    'Content-Type': 'application/json',
                },
            }));
            return true;
        }
        catch (error) {
            this.logError(error, 'confirmFbsOrderWithSupply');
            return false;
        }
    }
    async confirmDbsOrder(wbOrderId) {
        try {
            await (0, rxjs_1.firstValueFrom)(this.httpService.patch(`${this.MARKETPLACE_API}/api/v3/dbs/orders/${wbOrderId}/confirm`, {}, {
                headers: {
                    ...this.authHeader(),
                    'Content-Type': 'application/json',
                },
            }));
            return true;
        }
        catch (error) {
            this.logError(error, 'confirmDbsOrder');
            return false;
        }
    }
    async confirmDbwOrder(wbOrderId) {
        const token = this.config.statsToken ?? this.config.apiKey;
        if (!token)
            return false;
        try {
            await (0, rxjs_1.firstValueFrom)(this.httpService.patch(`${this.MARKETPLACE_API}/api/v3/dbw/orders/${wbOrderId}/confirm`, {}, {
                headers: {
                    ...this.authHeader(token),
                    'Content-Type': 'application/json',
                },
            }));
            return true;
        }
        catch (error) {
            this.logError(error, 'confirmDbwOrder');
            return false;
        }
    }
    async createOrGetActiveSupply() {
        try {
            let next = 0;
            const limit = 1000;
            let activeId = null;
            do {
                const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.MARKETPLACE_API}/api/v3/supplies`, {
                    headers: this.authHeader(),
                    params: { limit, next },
                }));
                const list = data?.supplies ?? [];
                const active = list.find((s) => !s.done);
                if (active?.id) {
                    activeId = active.id;
                    break;
                }
                next = data?.next ?? 0;
            } while (next > 0);
            if (activeId)
                return activeId;
            const name = `HandySeller-${new Date().toISOString().slice(0, 10)}`;
            const { data: created } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.MARKETPLACE_API}/api/v3/supplies`, { name }, { headers: { ...this.authHeader(), 'Content-Type': 'application/json' } }));
            return created?.id ?? null;
        }
        catch (error) {
            this.logError(error, 'createOrGetActiveSupply');
            const msg = this.extractWbErrorMessage(error);
            throw new Error(msg || 'WB API: ошибка при получении/создании поставки');
        }
    }
    extractWbErrorMessage(error) {
        if (error && typeof error === 'object' && 'response' in error) {
            const res = error.response;
            if (res?.data && typeof res.data === 'object' && 'message' in res.data) {
                return String(res.data.message);
            }
            if (res?.status)
                return `WB API ответ: ${res.status}`;
        }
        return error instanceof Error ? error.message : String(error);
    }
    async ensureFbsSupply() {
        return this.createOrGetActiveSupply();
    }
    async addTrbxToSupply(supplyId, amount) {
        const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.MARKETPLACE_API}/api/v3/supplies/${encodeURIComponent(supplyId)}/trbx`, { amount }, { headers: { ...this.authHeader(), 'Content-Type': 'application/json' } }));
        return data?.trbxIds ?? [];
    }
    async getTrbxStickers(supplyId, trbxIds, type = 'png') {
        const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.MARKETPLACE_API}/api/v3/supplies/${encodeURIComponent(supplyId)}/trbx/stickers`, { trbxIds }, {
            headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
            params: { type },
        }));
        return data?.stickers ?? [];
    }
    async deliverSupply(supplyId) {
        try {
            await (0, rxjs_1.firstValueFrom)(this.httpService.patch(`${this.MARKETPLACE_API}/api/v3/supplies/${encodeURIComponent(supplyId)}/deliver`, {}, { headers: this.authHeader() }));
            return true;
        }
        catch (error) {
            this.logError(error, 'deliverSupply');
            return false;
        }
    }
    async getSupplyBarcode(supplyId, type = 'png') {
        try {
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.MARKETPLACE_API}/api/v3/supplies/${encodeURIComponent(supplyId)}/barcode`, { headers: this.authHeader(), params: { type } }));
            if (data?.barcode && data?.file)
                return { barcode: data.barcode, file: data.file };
            return null;
        }
        catch (error) {
            this.logError(error, 'getSupplyBarcode');
            return null;
        }
    }
    async getSupplyTrbx(supplyId) {
        const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.MARKETPLACE_API}/api/v3/supplies/${encodeURIComponent(supplyId)}/trbx`, { headers: this.authHeader() }));
        return data?.trbxes ?? [];
    }
    mapStatusToWB(status) {
        const statusMap = {
            NEW: 1,
            IN_PROGRESS: 2,
            CONFIRMED: 2,
            SHIPPED: 3,
            READY_FOR_PICKUP: 3,
            DELIVERED: 4,
            CANCELLED: 5,
        };
        return statusMap[status] ?? 1;
    }
    async syncProducts(products) {
        const result = { success: true, syncedCount: 0, failedCount: 0, errors: [], createdMappings: [] };
        for (const product of products) {
            try {
                let nmId;
                if (product.wbNmId != null && product.wbNmId > 0) {
                    nmId = String(product.wbNmId);
                }
                else {
                    const wbMatch = product.sku?.match(/^WB-[^-]+-(\d+)$/);
                    nmId = wbMatch?.[1];
                }
                if (nmId) {
                    const ok = await this.updateProduct(nmId, product);
                    if (ok)
                        result.syncedCount++;
                    else {
                        result.failedCount++;
                        result.errors?.push(`Товар ${product.name}: ошибка обновления на WB`);
                    }
                }
                else {
                    const extId = await this.uploadProduct(product);
                    result.syncedCount++;
                    result.createdMappings?.push({ productId: product.id, externalSystemId: extId });
                }
            }
            catch (error) {
                result.failedCount++;
                result.errors?.push(`Товар ${product.name}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        result.success = result.failedCount === 0;
        return result;
    }
    async getProductsFromWb() {
        try {
            let pricesList = [];
            try {
                const pricesRes = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.PRICES_API}/public/api/v1/prices`, {
                    headers: this.authHeader(),
                    timeout: 5000,
                }));
                pricesList = Array.isArray(pricesRes?.data) ? pricesRes.data : [];
            }
            catch {
            }
            const priceMap = new Map();
            for (const p of pricesList) {
                const nmId = p?.nmID ?? p?.nmId;
                if (nmId != null && p?.price != null)
                    priceMap.set(Number(nmId), Number(p.price) / 100);
            }
            const allCards = [];
            let cursor = { limit: 100 };
            const sort = { ascending: true };
            do {
                const cardsRes = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.CONTENT_API}/content/v2/get/cards/list`, {
                    settings: { cursor, sort, filter: { withPhoto: -1 } },
                }, { headers: { ...this.authHeader(), 'Content-Type': 'application/json' }, timeout: 15000 }));
                const data = cardsRes?.data;
                if (data && typeof data === 'object' && data.error) {
                    const errMsg = data.errorText ?? 'Ошибка WB API';
                    throw new Error(errMsg);
                }
                const pageCards = (Array.isArray(data?.cards) ? data.cards
                    : Array.isArray(data?.data?.cards) ? data.data.cards
                        : []);
                allCards.push(...pageCards);
                const respCursor = (data?.cursor ?? {});
                const total = respCursor?.total ?? 0;
                if (pageCards.length === 0 || total < (cursor.limit ?? 100))
                    break;
                cursor = { updatedAt: respCursor.updatedAt, nmID: respCursor.nmID, limit: 100 };
            } while (true);
            const norm = (a) => ({
                name: String((a.name ?? a.attributeName ?? a.attribute ?? '')).trim(),
                value: String((a.value ?? a.attributeValue ?? a.val ?? a.text ?? '')).trim(),
            });
            const collectAddin = (c) => {
                const raw = [];
                const cardChars = c.characteristics;
                if (Array.isArray(cardChars))
                    raw.push(...cardChars);
                const cardAddin = c.addin;
                if (Array.isArray(cardAddin))
                    raw.push(...cardAddin);
                const goodsList = c.goods;
                if (Array.isArray(goodsList)) {
                    for (const g of goodsList) {
                        const ga = g.addin ?? g.characteristics;
                        if (Array.isArray(ga))
                            raw.push(...ga);
                    }
                }
                return raw.map(norm).filter((x) => x.name || x.value);
            };
            return allCards.map((card) => {
                const nmId = Number(card.nmID ?? card.nmId ?? 0);
                const goods = card.goods ?? [];
                const good = goods[0];
                const addin = collectAddin(card);
                const findByKey = (key) => addin.find((a) => (a.name || '').toLowerCase().includes(key.toLowerCase()))?.value;
                const findByAnyKey = (keys) => {
                    for (const k of keys) {
                        const v = findByKey(k);
                        if (v && String(v).trim())
                            return v;
                    }
                    return undefined;
                };
                const name = card.title?.trim() ||
                    findByKey('наименование') ||
                    String(card.vendorCode ?? good?.vendorCode ?? nmId);
                const description = (typeof card.description === 'string' && card.description.trim()) || findByKey('описание');
                const mediaFiles = card.mediaFiles ?? [];
                const imageUrl = mediaFiles[0]?.url;
                const dims = (card.dimensions ?? good);
                const wCm = dims?.width ?? good?.width;
                const hCm = dims?.height ?? good?.height;
                const lCm = dims?.length ?? good?.length;
                const weightKg = dims?.weightBrutto ?? good?.weightBrutto;
                const weight = weightKg != null ? Math.round(weightKg * 1000) : undefined;
                const width = wCm != null ? Math.round(wCm * 10) : undefined;
                const height = hCm != null ? Math.round(hCm * 10) : undefined;
                const length = lCm != null ? Math.round(lCm * 10) : undefined;
                const itemsPerPackVal = findByAnyKey(['количество предметов в упаковке', 'предметов в упаковке', 'в упаковке']);
                const itemsPerPack = itemsPerPackVal ? parseInt(String(itemsPerPackVal).replace(/\D/g, '') || '0', 10) : undefined;
                const seo = card.seoText;
                const richVal = findByAnyKey(['рич контент', 'рич-контент', 'расширенное описание']) ??
                    card.extendedDescription ??
                    seo?.description;
                const richContent = typeof richVal === 'string' && richVal.trim() ? richVal.trim() : undefined;
                return {
                    nmId,
                    vendorCode: String(good?.vendorCode ?? card.vendorCode ?? nmId),
                    name,
                    description,
                    imageUrl: imageUrl || undefined,
                    price: priceMap.get(nmId),
                    brand: card.brand?.trim() || undefined,
                    color: findByAnyKey(['цвет'])?.trim() || undefined,
                    weight: weight && weight > 0 ? weight : undefined,
                    width: width && width > 0 ? width : undefined,
                    length: length && length > 0 ? length : undefined,
                    height: height && height > 0 ? height : undefined,
                    itemsPerPack: itemsPerPack && itemsPerPack > 0 ? itemsPerPack : undefined,
                    countryOfOrigin: (card.countryProduction ?? findByAnyKey(['страна производства', 'страна']))?.trim() || undefined,
                    material: findByAnyKey(['материал изделия', 'материал'])?.trim() || undefined,
                    craftType: findByAnyKey(['вид творчества', 'творчество', 'handmade'])?.trim() || undefined,
                    packageContents: findByAnyKey(['комплектация', 'что входит'])?.trim() || undefined,
                    richContent,
                };
            });
        }
        catch (error) {
            const axErr = error;
            const wbDetail = axErr?.response?.data?.errorText ?? axErr?.response?.data?.detail ?? axErr?.response?.data?.title;
            const wbErrors = axErr?.response?.data?.errors;
            const status = axErr?.response?.status;
            let msg = error instanceof Error ? error.message : String(error);
            if (status === 401)
                msg = 'Токен WB невалиден или истёк. Обновите токен в настройках.';
            else if (status === 403)
                msg = 'Нет доступа к Content API. Проверьте права токена.';
            else if (wbDetail)
                msg = wbDetail;
            else if (Array.isArray(wbErrors) && wbErrors.length)
                msg = wbErrors.join('; ');
            this.logError(error, 'getProductsFromWb');
            throw new Error(msg);
        }
    }
    async getOrderCostsFromReport(dateFrom, dateTo) {
        const token = this.config.statsToken ?? this.config.apiKey;
        const result = new Map();
        let rrdid = 0;
        const limit = 10000;
        while (true) {
            const res = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.STATISTICS_API}/api/v5/supplier/reportDetailByPeriod`, {
                headers: this.authHeader(token),
                params: {
                    dateFrom: dateFrom.toISOString(),
                    dateTo: dateTo.toISOString(),
                    rrdid,
                    limit,
                },
            }));
            const data = res.data;
            if (res.status === 204 || !Array.isArray(data) || data.length === 0)
                break;
            for (const row of data) {
                const qty = Number(row.quantity ?? 0);
                const docType = String(row.doc_type_name ?? '').toLowerCase();
                if (qty <= 0 || !docType.includes('продажа'))
                    continue;
                const srid = String(row.srid ?? '').trim();
                if (!srid)
                    continue;
                const deliveryRub = Number(row.delivery_rub ?? 0);
                const commission = Number(row.ppvz_sales_commission ?? 0);
                const existing = result.get(srid);
                if (existing) {
                    existing.logisticsCost += deliveryRub;
                    existing.commissionAmount += commission;
                }
                else {
                    result.set(srid, { logisticsCost: deliveryRub, commissionAmount: commission });
                }
            }
            const last = data[data.length - 1];
            const nextRrdid = Number(last?.rrd_id ?? 0);
            if (nextRrdid <= 0 || data.length < limit)
                break;
            rrdid = nextRrdid;
            await new Promise((r) => setTimeout(r, 65000));
        }
        return result;
    }
    async getStatistics() {
        try {
            const [productsRes, ordersRes] = await Promise.all([
                (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.CONTENT_API}/content/v2/get/cards/list`, {
                    settings: { cursor: { limit: 100 }, filter: { withPhoto: -1 } },
                }, { headers: { ...this.authHeader(), 'Content-Type': 'application/json' } })),
                (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.MARKETPLACE_API}/api/v3/orders`, {
                    headers: this.authHeader(),
                    params: {
                        date_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
                        limit: 1000,
                    },
                })),
            ]);
            const cards = productsRes.data?.cards ?? [];
            const orders = ordersRes.data?.orders ?? [];
            const revenue = orders.reduce((sum, o) => sum + o.totalPrice / 100, 0);
            return {
                totalProducts: cards.length,
                totalOrders: orders.length,
                revenue,
                lastSyncAt: new Date(),
            };
        }
        catch (error) {
            this.logError(error, 'getStatistics');
            return { totalProducts: 0, totalOrders: 0, revenue: 0, lastSyncAt: new Date() };
        }
    }
};
exports.WildberriesAdapter = WildberriesAdapter;
exports.WildberriesAdapter = WildberriesAdapter = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [crypto_service_1.CryptoService,
        axios_1.HttpService, Object])
], WildberriesAdapter);
//# sourceMappingURL=wildberries.adapter.js.map