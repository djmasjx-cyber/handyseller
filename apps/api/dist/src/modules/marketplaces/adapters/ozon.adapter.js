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
var OzonAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OzonAdapter = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const base_marketplace_adapter_1 = require("./base-marketplace.adapter");
const crypto_service_1 = require("../../../common/crypto/crypto.service");
let OzonAdapter = OzonAdapter_1 = class OzonAdapter extends base_marketplace_adapter_1.BaseMarketplaceAdapter {
    constructor(crypto, httpService, config) {
        super(crypto, {
            ...config,
            baseUrl: config.baseUrl || 'https://seller.ozon.ru',
        });
        this.logger = new common_1.Logger(OzonAdapter_1.name);
        this.API_BASE = 'https://api-seller.ozon.ru';
        this.httpService = httpService;
    }
    convertToPlatform(canonical) {
        const offerId = canonical.vendor_code ?? canonical.canonical_sku;
        const descText = canonical.long_description_html?.trim() || (canonical.long_description_plain ?? canonical.short_description ?? '');
        const attributes = [
            { complex_id: 0, id: 4189, values: [{ dictionary_value_id: 0, value: canonical.title }] },
            { complex_id: 0, id: 4190, values: [{ dictionary_value_id: 0, value: descText }] },
        ];
        const height = canonical.height_mm ?? 100;
        const width = canonical.width_mm ?? 100;
        const depth = canonical.length_mm ?? 100;
        const weight = canonical.weight_grams ?? 100;
        const item = {
            attributes,
            images: canonical.images?.map((i) => i.url) ?? [],
            name: canonical.title,
            offer_id: offerId,
            old_price: canonical.old_price ? String(Math.round(canonical.old_price)) : String(Math.round(canonical.price * 1.2)),
            price: String(Math.round(canonical.price)),
            vat: '0',
            height,
            width,
            depth,
            dimension_unit: 'mm',
            weight,
            weight_unit: 'g',
        };
        if (canonical.seo_title || canonical.seo_keywords || canonical.seo_description) {
            item.seo_text = {
                title: canonical.seo_title ?? canonical.title,
                keywords: canonical.seo_keywords ?? '',
                description: canonical.seo_description ?? '',
            };
        }
        return { items: [item] };
    }
    async authenticate() {
        if (!this.config.sellerId?.trim() || !this.config.apiKey?.trim()) {
            return false;
        }
        const headers = {
            'Client-Id': this.config.sellerId.trim(),
            'Api-Key': this.config.apiKey.trim(),
            'Content-Type': 'application/json',
        };
        const endpoints = [
            { url: `${this.API_BASE}/v1/warehouse/list`, body: {} },
            { url: `${this.API_BASE}/v2/product/list`, body: { limit: 1, offset: 0 } },
            { url: `${this.API_BASE}/v3/product/list`, body: {} },
        ];
        let lastError = null;
        for (const { url, body } of endpoints) {
            try {
                const { status, data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(url, body, {
                    headers,
                    validateStatus: () => true,
                }));
                if (status >= 200 && status < 300)
                    return true;
                lastError = this.extractOzonErrorFromResponse(status, data);
            }
            catch (error) {
                lastError = this.extractOzonError(error);
                this.logError(error, `authenticate ${url}`);
            }
        }
        if (lastError) {
            throw new Error(`Ozon: ${lastError}`);
        }
        return false;
    }
    extractOzonErrorFromResponse(status, data) {
        if (data && typeof data === 'object') {
            const d = data;
            if (d.message)
                return d.message;
            if (Array.isArray(d.details) && d.details[0]?.message)
                return d.details[0].message;
            if (d.code)
                return String(d.code);
        }
        if (status === 401)
            return 'Неверный API ключ или Client ID';
        if (status === 403)
            return 'Доступ запрещён. Проверьте права ключа в кабинете Ozon';
        return `HTTP ${status}`;
    }
    extractOzonError(error) {
        if (error && typeof error === 'object' && 'response' in error) {
            const res = error.response;
            if (res)
                return this.extractOzonErrorFromResponse(res.status ?? 0, res.data);
        }
        return error instanceof Error ? error.message : String(error);
    }
    generateEan13(offerId) {
        let hash = 0;
        for (let i = 0; i < offerId.length; i++) {
            hash = (hash * 31 + offerId.charCodeAt(i)) >>> 0;
        }
        const base = '460' + String(Math.abs(hash) % 1e9).padStart(9, '0');
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += (i % 2 === 0 ? 1 : 3) * parseInt(base[i], 10);
        }
        const check = (10 - (sum % 10)) % 10;
        return base + String(check);
    }
    sanitizeOfferId(val) {
        return val.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || `HS_${Math.random().toString(36).slice(2, 10)}`;
    }
    ozonHeaders() {
        return {
            'Client-Id': this.config.sellerId ?? '',
            'Api-Key': this.config.apiKey,
            'Content-Type': 'application/json',
        };
    }
    async getWarehouseList() {
        const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v1/warehouse/list`, {}, { headers: this.ozonHeaders(), timeout: 15000 }));
        const items = data?.result ?? [];
        const result = [];
        for (const w of items) {
            const id = w.warehouse_id;
            const num = typeof id === 'number' ? id : (typeof id === 'string' ? parseInt(id, 10) : NaN);
            if (num > 0)
                result.push({ warehouse_id: num, name: w.name ?? '' });
        }
        return result;
    }
    async getCategoryTree() {
        const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v1/description-category/tree`, {}, { headers: this.ozonHeaders(), timeout: 15000 }));
        return Array.isArray(data?.result) ? data.result : [];
    }
    async getCategoryAttributes(descriptionCategoryId, typeId) {
        const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v1/description-category/attribute`, { description_category_id: descriptionCategoryId, type_id: typeId }, { headers: this.ozonHeaders(), timeout: 15000 }));
        const items = data?.result ?? [];
        const mapped = [];
        for (const r of items) {
            const attr = (r && typeof r === 'object' && 'attribute' in r)
                ? r.attribute
                : r;
            if (attr && typeof attr === 'object' && typeof attr.id === 'number') {
                mapped.push(attr);
            }
        }
        return mapped;
    }
    mapAttributeToValue(attr, product, offerId) {
        const id = attr.id;
        const name = (attr.name ?? '').toLowerCase();
        if (id === 4180 || name.includes('бренд'))
            return (product.brand || 'Ручная работа').trim().slice(0, 200);
        if (id === 9048 || name.includes('название модели') || name.includes('модель'))
            return (product.name || offerId).slice(0, 500);
        if (name.includes('тип'))
            return (product.craftType || product.name || offerId).trim().slice(0, 500);
        return (product.name || offerId).slice(0, 500);
    }
    buildImportPayload(product, requiredAttributes) {
        const priceNum = Math.round(Number(product.price));
        const offerId = this.sanitizeOfferId(product.vendorCode ?? `HS_${product.id.slice(0, 8)}`);
        const barcode = (product.barcodeOzon ?? product.barcode)?.trim() ||
            this.generateEan13(product.vendorCode ?? product.id);
        const priceStr = String(priceNum);
        const oldPriceNum = Math.max(priceNum + 1, Math.round(product.price * 1.25));
        const oldPriceStr = String(oldPriceNum);
        const validImages = product.images?.filter((u) => typeof u === 'string' && u.startsWith('http')) ?? [];
        const height = product.height ?? 100;
        const width = product.width ?? 100;
        const depth = product.length ?? 100;
        const weight = product.weight ?? 100;
        const descriptionCategoryId = product.ozonCategoryId ?? 17028922;
        const typeId = product.ozonTypeId ?? 91565;
        const modelName = (product.name || offerId).slice(0, 500);
        const brandValue = (product.brand || 'Ручная работа').trim().slice(0, 200);
        let attributes;
        if (Array.isArray(requiredAttributes) && requiredAttributes.length > 0) {
            attributes = requiredAttributes.map((attr) => ({
                id: attr.id,
                complex_id: 0,
                values: [{ dictionary_value_id: 0, value: this.mapAttributeToValue(attr, product, offerId) }],
            }));
        }
        else {
            attributes = [
                { id: 9048, complex_id: 0, values: [{ dictionary_value_id: 0, value: modelName }] },
                { id: 4180, complex_id: 0, values: [{ dictionary_value_id: 0, value: brandValue }] },
            ];
        }
        const item = {
            description_category_id: descriptionCategoryId,
            type_id: typeId,
            name: (product.name || '').slice(0, 500),
            offer_id: offerId,
            barcode,
            price: priceStr,
            old_price: oldPriceStr,
            vat: '0',
            height,
            width,
            depth,
            dimension_unit: 'mm',
            weight,
            weight_unit: 'g',
            images: validImages,
            attributes,
        };
        const extra = [];
        if (product.color?.trim())
            extra.push(`Цвет: ${product.color.trim()}`);
        if (product.itemsPerPack != null && product.itemsPerPack > 0)
            extra.push(`Кол-во в упаковке: ${product.itemsPerPack}`);
        if (product.material?.trim())
            extra.push(`Материал: ${product.material.trim()}`);
        if (product.craftType?.trim())
            extra.push(`Вид творчества: ${product.craftType.trim()}`);
        if (product.countryOfOrigin?.trim())
            extra.push(`Страна производства: ${product.countryOfOrigin.trim()}`);
        if (product.packageContents?.trim())
            extra.push(`Комплектация: ${product.packageContents.trim()}`);
        let desc = product.description?.trim() ?? '';
        if (product.richContent?.trim()) {
            desc = desc ? `${desc}\n\n${product.richContent.trim()}` : product.richContent.trim();
        }
        if (extra.length) {
            desc = desc ? `${desc}\n\n${extra.join('\n')}` : extra.join('\n');
        }
        if (desc) {
            item.description = desc.slice(0, 5000);
        }
        const mapping = {
            name: { our: product.name, ozon: item.name },
            offer_id: { our: product.vendorCode ?? product.id, ozon: offerId },
            barcode: { our: product.barcodeOzon ?? product.barcode ?? '(EAN-13)', ozon: barcode },
            price: { our: product.price, ozon: priceStr },
            images: { our: product.images?.length ?? 0, ozon: validImages.length },
            weight: { our: product.weight ?? weight, ozon: weight },
            width: { our: product.width ?? width, ozon: width },
            depth: { our: product.length ?? depth, ozon: depth },
            height: { our: product.height ?? height, ozon: height },
            attributes: { our: '9048, 4180', ozon: attributes.map((a) => `${a.id}`).join(', ') },
        };
        return {
            item,
            mapping,
            offerId,
            descriptionCategoryId,
            typeId,
            attributeIds: attributes.map((a) => a.id),
        };
    }
    async tryImportWithFullResponse(product) {
        try {
            const productId = await this.uploadProduct(product);
            return { success: true, productId };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const ozonResponse = err && typeof err === 'object' && 'ozonResponse' in err
                ? err.ozonResponse
                : undefined;
            return { success: false, error: msg, ozonResponse };
        }
    }
    async uploadProduct(product) {
        try {
            if (!this.config.sellerId?.trim() || !this.config.apiKey?.trim()) {
                throw new Error('Ozon не подключён или данные устарели. Подключите Ozon заново в разделе Маркетплейсы (Client ID и API Key).');
            }
            const priceNum = Math.round(Number(product.price));
            if (priceNum <= 0) {
                throw new Error('Ozon не принимает цену 0 или отрицательную. Укажите цену больше 0 в карточке товара.');
            }
            const validImages = product.images?.filter((u) => typeof u === 'string' && u.startsWith('http')) ?? [];
            if (validImages.length === 0) {
                throw new Error('Добавьте URL фото товара в карточке. Ozon требует хотя бы одно изображение.');
            }
            let requiredAttributes = [];
            try {
                const catId = product.ozonCategoryId ?? 17028922;
                const typeId = product.ozonTypeId ?? 91565;
                requiredAttributes = (await this.getCategoryAttributes(catId, typeId)).filter((a) => a.is_required);
            }
            catch {
            }
            const { item, offerId } = this.buildImportPayload(product, requiredAttributes.length > 0 ? requiredAttributes : undefined);
            this.logger.debug(`Ozon import: offer_id=${offerId}, category=${item.description_category_id}, type=${item.type_id}, images=${item.images.length}`);
            const { status: httpStatus, data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v3/product/import`, { items: [item] }, {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
                validateStatus: () => true,
            }));
            if (httpStatus >= 400 || data?.code || data?.message) {
                this.logger.warn(`Ozon v3/import HTTP ${httpStatus}: ${JSON.stringify(data)}`);
            }
            const taskId = data?.result?.task_id;
            if (!taskId) {
                let errMsg = this.extractOzonImportError(data) ??
                    data?.message ??
                    (Array.isArray(data?.errors) ? data.errors[0] : null) ??
                    'Не удалось создать товар';
                if (httpStatus === 401 || (typeof errMsg === 'string' && /unauthorized/i.test(errMsg))) {
                    errMsg = 'Неверный API ключ или Client ID. Проверьте данные в ЛК Ozon (Настройки → API-ключи) и переподключите в разделе Маркетплейсы.';
                }
                else if (httpStatus === 403) {
                    errMsg = 'Доступ запрещён. Проверьте права API ключа в кабинете Ozon.';
                }
                throw new Error(String(errMsg));
            }
            await new Promise((r) => setTimeout(r, 2000));
            const statusData = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v1/product/import/info`, { task_id: taskId }, {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
            })).then((r) => r.data);
            const items = statusData?.result?.items ?? [];
            const firstItem = items[0];
            const ozonStatus = String(firstItem?.status ?? statusData?.result?.state ?? '');
            let productId = firstItem?.product_id;
            if (ozonStatus !== 'imported' && ozonStatus !== 'processed' && ozonStatus !== 'skipped') {
                this.logger.warn(`Ozon import/info task=${taskId}: status=${ozonStatus}, items=${JSON.stringify(items)}, state=${statusData?.result?.state}`);
            }
            if (ozonStatus === 'imported' || ozonStatus === 'processed') {
                if (productId && this.config.warehouseId) {
                    await this.setStock(product.vendorCode ?? product.id, String(productId), product.stock);
                }
                if (productId) {
                    await this.generateBarcodes([String(productId)]);
                    await new Promise((r) => setTimeout(r, 5000));
                    return String(productId);
                }
            }
            if (ozonStatus === 'skipped') {
                if (!productId) {
                    productId = await this.findProductIdByOfferId(offerId);
                }
                if (productId) {
                    return String(productId);
                }
            }
            const errParts = this.collectOzonErrors(firstItem?.errors, statusData?.result?.errors, statusData?.message);
            const errMsg = errParts.length > 0
                ? errParts.join('; ')
                : `Статус: ${ozonStatus || 'unknown'}. Проверьте категорию (ozonCategoryId/ozonTypeId) и обязательные атрибуты.`;
            this.logger.warn(`Ozon import failed: task=${taskId}, status=${ozonStatus}, errors=${JSON.stringify(firstItem?.errors)}`);
            const err = new Error(errMsg);
            err.ozonResponse = statusData;
            throw err;
        }
        catch (error) {
            this.logError(error, 'uploadProduct');
            let msg = this.extractOzonErrorFromAxios(error) || (error instanceof Error ? error.message : String(error));
            if (/unauthorized/i.test(String(msg))) {
                msg = 'Неверный API ключ или Client ID. Проверьте данные в ЛК Ozon (Настройки → API-ключи) и переподключите в разделе Маркетплейсы.';
            }
            else if (/forbidden|доступ запрещён/i.test(String(msg))) {
                msg = 'Доступ запрещён. Проверьте права API ключа в кабинете Ozon.';
            }
            const err = new Error(`Ошибка выгрузки товара на Ozon: ${msg}`);
            if (error && typeof error === 'object' && 'ozonResponse' in error) {
                err.ozonResponse = error.ozonResponse;
            }
            throw err;
        }
    }
    collectOzonErrors(itemErrors, resultErrors, fallbackMessage) {
        const parts = [];
        const add = (arr) => {
            if (!Array.isArray(arr))
                return;
            for (const e of arr) {
                if (typeof e === 'string' && e.trim())
                    parts.push(e.trim());
                else if (e && typeof e === 'object' && 'message' in e) {
                    const m = e.message;
                    if (typeof m === 'string' && m.trim())
                        parts.push(m.trim());
                }
                else if (e && typeof e === 'object' && 'description' in e) {
                    const d = e.description;
                    if (typeof d === 'string' && d.trim())
                        parts.push(d.trim());
                }
            }
        };
        add(itemErrors);
        add(resultErrors);
        if (parts.length === 0 && typeof fallbackMessage === 'string' && fallbackMessage.trim()) {
            parts.push(fallbackMessage.trim());
        }
        return [...new Set(parts)];
    }
    extractOzonImportError(data) {
        if (!data || typeof data !== 'object')
            return null;
        const d = data;
        const details = d.details;
        if (Array.isArray(details) && details.length > 0) {
            const parts = details
                .map((x) => x?.message ?? x?.description ?? (typeof x === 'string' ? x : null))
                .filter(Boolean);
            if (parts.length)
                return parts.join('; ');
        }
        const errors = d.errors;
        if (Array.isArray(errors) && errors.length > 0) {
            const first = errors[0];
            return typeof first === 'string' ? first : first?.message ?? null;
        }
        return d.message ?? null;
    }
    extractOzonErrorFromAxios(error) {
        if (error && typeof error === 'object' && 'response' in error) {
            const res = error.response;
            const status = res?.status;
            if (res?.data) {
                const d = res.data;
                const details = d.details;
                if (Array.isArray(details) && details.length > 0) {
                    const parts = details
                        .map((x) => x?.message ?? x?.description ?? (typeof x === 'string' ? x : null))
                        .filter(Boolean);
                    if (parts.length)
                        return parts.join('; ');
                    return d.message ?? String(details[0]);
                }
                const errors = d.errors;
                if (Array.isArray(errors) && errors.length > 0) {
                    const first = errors[0];
                    const msg = typeof first === 'string' ? first : first?.message;
                    if (msg)
                        return msg;
                }
                if (d.message)
                    return String(d.message);
                if (d.code)
                    return `[${d.code}] ${String(d.message || '')}`.trim() || String(d.code);
            }
            if (status)
                return `HTTP ${status}`;
        }
        return null;
    }
    async findProductIdByOfferId(offerId) {
        const filters = [
            { offer_id: [offerId], visibility: 'ALL' },
            { offer_id: [offerId], visibility: 'ARCHIVED' },
            { offer_id: [offerId] },
        ];
        for (const filter of filters) {
            try {
                const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v3/product/list`, { filter, limit: 1 }, {
                    headers: {
                        'Client-Id': this.config.sellerId ?? '',
                        'Api-Key': this.config.apiKey,
                        'Content-Type': 'application/json',
                    },
                }));
                const items = data?.result?.items ?? [];
                const first = items[0];
                if (first?.product_id)
                    return first.product_id;
            }
            catch {
            }
        }
        return undefined;
    }
    async getProductStocks(offerIds) {
        const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v4/product/info/stocks`, { filter: { visibility: 'ALL', offer_id: offerIds } }, {
            headers: this.ozonHeaders(),
            timeout: 15000,
        }));
        const items = (data?.result?.items ?? []);
        return { items };
    }
    async setStockWithResponse(offerId, productId, stock) {
        if (!this.config.warehouseId || !this.config.sellerId) {
            throw new Error('warehouseId и sellerId обязательны для обновления остатков Ozon');
        }
        const warehouseId = this.config.warehouseId.trim();
        const warehouseIdNum = Number(warehouseId);
        if (isNaN(warehouseIdNum) || warehouseIdNum <= 0) {
            throw new Error(`Некорректный warehouse_id: ${warehouseId}`);
        }
        const body = {
            stocks: [{ offer_id: offerId, product_id: Number(productId), stock, warehouse_id: warehouseIdNum }],
        };
        const res = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v2/products/stocks`, body, {
            headers: this.ozonHeaders(),
            validateStatus: () => true,
        }));
        return { request: body, response: res.data, status: res.status };
    }
    async setStock(offerId, productId, stock) {
        if (!this.config.warehouseId || !this.config.sellerId) {
            throw new Error('warehouseId и sellerId обязательны для обновления остатков Ozon');
        }
        const warehouseId = this.config.warehouseId.trim();
        const warehouseIdNum = Number(warehouseId);
        if (isNaN(warehouseIdNum) || warehouseIdNum <= 0) {
            throw new Error(`Некорректный warehouse_id: ${warehouseId}. Получите ID через «Загрузить склады» в настройках Ozon.`);
        }
        const body = {
            stocks: [
                {
                    offer_id: offerId,
                    product_id: Number(productId),
                    stock,
                    warehouse_id: warehouseIdNum,
                },
            ],
        };
        try {
            await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v2/products/stocks`, body, {
                headers: {
                    'Client-Id': this.config.sellerId,
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
            }));
        }
        catch (error) {
            const ozonMsg = this.extractOzonErrorFromAxios(error);
            this.logError(error, 'setStock');
            throw new Error(ozonMsg ||
                `Ozon setStock: offer_id=${offerId}, product_id=${productId}, warehouse_id=${warehouseId} — ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async updateProduct(marketplaceProductId, product) {
        try {
            const productIdNum = parseInt(marketplaceProductId, 10);
            if (isNaN(productIdNum)) {
                throw new Error('Некорректный product_id Ozon');
            }
            const headers = {
                'Client-Id': this.config.sellerId ?? '',
                'Api-Key': this.config.apiKey,
                'Content-Type': 'application/json',
            };
            if (product.price !== undefined) {
                await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v1/product/import/prices`, {
                    prices: [
                        {
                            product_id: productIdNum,
                            price: String(Math.round(product.price)),
                            old_price: String(Math.round(product.price * 1.1)),
                        },
                    ],
                }, { headers }));
            }
            if (product.stock !== undefined) {
                if (!this.config.warehouseId || !this.config.sellerId) {
                    throw new Error('Для обновления остатков Ozon укажите ID склада в настройках подключения (Маркетплейсы → Ozon → Склад).');
                }
                const rawOffer = (product.vendorCode ?? product.id ?? '').toString();
                const offerId = rawOffer ? this.sanitizeOfferId(rawOffer) : `HS_${(product.id ?? '').toString().slice(0, 8)}`;
                await this.setStock(offerId, marketplaceProductId, product.stock);
            }
            const hasContentUpdate = product.name != null ||
                product.description != null ||
                (product.images != null && product.images.length > 0) ||
                product.weight != null ||
                product.width != null ||
                product.length != null ||
                product.height != null ||
                product.brand != null ||
                product.color != null ||
                product.material != null ||
                product.craftType != null ||
                product.countryOfOrigin != null ||
                product.packageContents != null ||
                product.richContent != null ||
                product.itemsPerPack != null;
            if (hasContentUpdate && product.vendorCode && product.name) {
                const validImages = product.images?.filter((u) => typeof u === 'string' && u.startsWith('http')) ?? [];
                if (validImages.length > 0) {
                    try {
                        const fullProduct = {
                            id: product.id ?? '',
                            name: product.name,
                            description: product.description ?? '',
                            price: product.price ?? 0,
                            stock: product.stock ?? 0,
                            images: validImages,
                            vendorCode: product.vendorCode,
                            barcode: product.barcodeOzon ?? product.barcode,
                            brand: product.brand,
                            weight: product.weight,
                            width: product.width,
                            length: product.length,
                            height: product.height,
                            color: product.color,
                            material: product.material,
                            craftType: product.craftType,
                            countryOfOrigin: product.countryOfOrigin,
                            packageContents: product.packageContents,
                            richContent: product.richContent,
                            itemsPerPack: product.itemsPerPack,
                            ozonCategoryId: product.ozonCategoryId,
                            ozonTypeId: product.ozonTypeId,
                            barcodeOzon: product.barcodeOzon,
                        };
                        const { item } = this.buildImportPayload(fullProduct);
                        const { status: httpStatus, data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v3/product/import`, { items: [item] }, { headers, validateStatus: () => true }));
                        if (httpStatus >= 400 || data?.code || data?.message) {
                            this.logger.warn(`Ozon v3/import (update) HTTP ${httpStatus}: ${JSON.stringify(data)}`);
                        }
                    }
                    catch (contentErr) {
                        this.logger.warn('Ozon v3/import (content update) failed:', contentErr);
                    }
                }
            }
            return true;
        }
        catch (error) {
            const ozonMsg = this.extractOzonErrorFromAxios(error);
            this.logError(error, 'updateProduct');
            const msg = ozonMsg ||
                (error instanceof Error ? error.message : String(error)) ||
                'Неизвестная ошибка';
            throw new Error(`Ozon: ${msg}`);
        }
    }
    async deleteProduct(marketplaceProductId) {
        try {
            await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v1/product/archive`, { product_id: [Number(marketplaceProductId)] }, {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
            }));
            return true;
        }
        catch (error) {
            this.logError(error, 'deleteProduct');
            return false;
        }
    }
    async getOrders(since) {
        const dateFrom = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const headers = {
            'Client-Id': this.config.sellerId ?? '',
            'Api-Key': this.config.apiKey,
            'Content-Type': 'application/json',
        };
        const toOrderData = (posting) => ({
            id: posting.posting_number,
            marketplaceOrderId: posting.posting_number,
            productId: posting.products?.[0]?.product_id?.toString() ?? '',
            customerName: posting.customer_name ?? 'Аноним',
            customerPhone: posting.phone,
            deliveryAddress: posting.address?.address_tail,
            status: posting.status,
            rawStatus: posting.status,
            amount: posting.products?.reduce((sum, p) => sum + (p.price ?? 0), 0) ?? 0,
            createdAt: new Date(posting.created_at),
        });
        const seen = new Set();
        const result = [];
        try {
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v3/posting/fbs/list`, {
                dir: 'asc',
                filter: { since: dateFrom.toISOString(), status: 'all' },
                limit: 1000,
                offset: 0,
                with: { analytics_data: true, financial_data: true },
            }, { headers, timeout: 15000 }));
            for (const p of data?.result ?? []) {
                const posting = p;
                if (!seen.has(posting.posting_number)) {
                    seen.add(posting.posting_number);
                    result.push(toOrderData(posting));
                }
            }
        }
        catch (error) {
            this.logError(error, 'getOrders FBS');
        }
        try {
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v2/posting/fbo/list`, {
                dir: 'asc',
                filter: { since: dateFrom.toISOString(), to: new Date().toISOString() },
                limit: 1000,
                offset: 0,
            }, { headers, timeout: 15000 }));
            for (const p of data?.result ?? []) {
                const posting = p;
                if (!seen.has(posting.posting_number)) {
                    seen.add(posting.posting_number);
                    result.push(toOrderData(posting));
                }
            }
        }
        catch (error) {
            this.logError(error, 'getOrders FBO');
        }
        return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    async getOrderCostsFromFinance(dateFrom, dateTo, postingNumbers) {
        const result = new Map();
        let page = 1;
        const pageSize = 100;
        const headers = {
            'Client-Id': this.config.sellerId ?? '',
            'Api-Key': this.config.apiKey,
            'Content-Type': 'application/json',
        };
        const operationTypes = [
            'ClientOrderDelivered',
            'ClientOrderDeliveredToCustomer',
            'ClientOrderDeliveredToCustomerReturn',
        ];
        while (true) {
            const filter = {
                date: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
                operation_type: operationTypes,
            };
            if (postingNumbers?.length) {
                filter.posting_number = postingNumbers[0];
            }
            const body = { filter, page, page_size: pageSize };
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v3/finance/transaction/list`, body, { headers }));
            const ops = data?.result?.operations ?? [];
            if (!Array.isArray(ops) || ops.length === 0)
                break;
            for (const op of ops) {
                const posting = op.posting;
                const postingNumber = posting ? String(posting.posting_number ?? '').trim() : '';
                if (!postingNumber)
                    continue;
                const deliveryCharge = Number(op.delivery_charge ?? 0);
                const saleCommission = Number(op.sale_commission ?? 0);
                const existing = result.get(postingNumber);
                if (existing) {
                    existing.logisticsCost += deliveryCharge;
                    existing.commissionAmount += saleCommission;
                }
                else {
                    result.set(postingNumber, {
                        logisticsCost: deliveryCharge,
                        commissionAmount: saleCommission,
                    });
                }
            }
            const rowCount = data?.result?.row_count ?? 0;
            if (ops.length < pageSize || page * pageSize >= rowCount)
                break;
            page++;
        }
        return result;
    }
    async updateOrderStatus(marketplaceOrderId, status, _options) {
        try {
            if (status === 'SHIPPED') {
                await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v2/posting/fbs/ship`, { posting_number: marketplaceOrderId }, {
                    headers: {
                        'Client-Id': this.config.sellerId ?? '',
                        'Api-Key': this.config.apiKey,
                        'Content-Type': 'application/json',
                    },
                }));
            }
            return true;
        }
        catch (error) {
            this.logError(error, 'updateOrderStatus');
            return false;
        }
    }
    async generateBarcodes(productIds) {
        const ids = productIds
            .map((id) => parseInt(String(id).trim(), 10))
            .filter((n) => !Number.isNaN(n));
        if (ids.length === 0)
            return;
        try {
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v1/barcode/generate`, { product_id: ids }, {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
            }));
            const errors = data?.errors;
            if (Array.isArray(errors) && errors.length > 0) {
                this.logError(new Error(String(errors[0])), 'generateBarcodes');
            }
        }
        catch (err) {
            this.logError(err, 'generateBarcodes');
        }
    }
    async getBarcodeByProductId(ozonProductId, offerId) {
        if (ozonProductId && !isNaN(parseInt(ozonProductId, 10))) {
            const byProduct = this.extractBarcode(await this.getProductInfoByProductId(ozonProductId));
            if (byProduct)
                return byProduct;
        }
        if (offerId) {
            const byOffer = this.extractBarcode(await this.getProductInfoByOfferId(offerId));
            if (byOffer)
                return byOffer;
        }
        return null;
    }
    extractBarcode(info) {
        if (!info || typeof info !== 'object')
            return null;
        const bc = info.barcodes;
        if (Array.isArray(bc) && bc.length > 0) {
            for (const item of bc) {
                const s = typeof item === 'string' ? item : (item && typeof item === 'object' && 'barcode' in item ? item.barcode : item?.value);
                if (typeof s === 'string' && s.trim())
                    return s.trim();
            }
        }
        const b = info.barcode;
        if (typeof b === 'string' && b.trim())
            return b.trim();
        const trySkuBarcode = (arr) => {
            if (!Array.isArray(arr) || arr.length === 0)
                return null;
            const first = arr[0];
            if (first && typeof first === 'object' && 'barcode' in first) {
                const v = first.barcode;
                if (typeof v === 'string' && v.trim())
                    return v.trim();
            }
            return null;
        };
        const fbs = trySkuBarcode(info.fbs_list ?? info.fbo_list);
        if (fbs)
            return fbs;
        return null;
    }
    async getProductInfoByProductId(ozonProductId) {
        const res = await this.getProductInfoByProductIdWithRaw(ozonProductId);
        const item = res?.item;
        if (!item || typeof item !== 'object' || Object.keys(item).length === 0)
            return null;
        return item;
    }
    async getProductInfoByProductIdWithRaw(ozonProductId) {
        try {
            const productIdNum = parseInt(ozonProductId, 10);
            if (isNaN(productIdNum))
                return null;
            const body = { product_id: [productIdNum] };
            const { data, status } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v3/product/info/list`, body, {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
                validateStatus: () => true,
            }));
            const items = (data?.result?.items ?? data?.items ?? []);
            const item = items[0] ?? null;
            if (!item && status === 200) {
                this.logger.warn(`Ozon v3/product/info/list: пустой items при product_id=${productIdNum}, status=${status}, keys=${Object.keys(data ?? {}).join(',')}`);
            }
            return { item: item, raw: { status, data } };
        }
        catch (err) {
            this.logError(err, 'getProductInfoByProductIdWithRaw');
            return null;
        }
    }
    async getProductInfoByOfferId(offerId) {
        const res = await this.getProductInfoByOfferIdWithRaw(offerId);
        return (res?.item ?? null);
    }
    async getProductInfoByOfferIdWithRaw(offerId) {
        const offerIdSanitized = offerId ? this.sanitizeOfferId(offerId) : '';
        if (!offerIdSanitized)
            return null;
        const productId = await this.findProductIdByOfferId(offerIdSanitized);
        if (productId) {
            const byProduct = await this.getProductInfoByProductIdWithRaw(String(productId));
            if (byProduct?.item)
                return { item: byProduct.item, raw: byProduct.raw };
        }
        try {
            const { data, status } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v3/product/info/list`, { offer_id: [offerIdSanitized] }, {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
                validateStatus: () => true,
            }));
            const items = (data?.result?.items ?? []);
            const item = items[0] ?? null;
            return { item, raw: { status, data } };
        }
        catch {
            return null;
        }
    }
    async getProductsFromOzon() {
        const items = [];
        let lastId;
        do {
            const body = {
                filter: { visibility: 'ALL' },
                limit: 100,
            };
            if (lastId)
                body.last_id = lastId;
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v3/product/list`, body, {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 15000,
            }));
            const result = data?.result;
            const pageItems = (result?.items ?? []);
            for (const it of pageItems) {
                const pid = it?.product_id ?? 0;
                const oid = (it?.offer_id ?? '').toString().trim();
                if (pid && oid)
                    items.push({ product_id: pid, offer_id: oid });
            }
            lastId = result?.last_id;
            if (!lastId || pageItems.length === 0)
                break;
        } while (true);
        const out = [];
        for (let i = 0; i < items.length; i += 100) {
            const batch = items.slice(i, i + 100);
            const productIds = batch.map((b) => b.product_id);
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v3/product/info/list`, { product_id: productIds }, {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 20000,
            }));
            const infoItems = (data?.result?.items ?? []);
            for (const inf of infoItems) {
                const pid = inf?.id ?? 0;
                const offerId = (inf?.offer_id ?? '').toString().trim();
                const name = (inf?.name ?? `Товар ${pid}`).trim().slice(0, 500);
                if (!name)
                    continue;
                let description;
                if (typeof inf?.description === 'string' && inf.description.trim()) {
                    description = inf.description.slice(0, 5000);
                }
                else if (Array.isArray(inf?.source)) {
                    const attr4190 = inf.source.find((a) => a?.attribute_id === 4190);
                    if (attr4190?.value)
                        description = attr4190.value.slice(0, 5000);
                }
                const images = inf?.images ?? [];
                const imageUrl = Array.isArray(images) && images.length > 0
                    ? (typeof images[0] === 'string' ? images[0] : images[0]?.url)
                    : undefined;
                const priceStr = inf?.marketing_price ?? inf?.price ?? inf?.old_price;
                const price = priceStr != null ? parseFloat(String(priceStr)) : undefined;
                const barcode = this.extractBarcode(inf);
                const catId = inf?.description_category_id;
                const typeId = inf?.type_id;
                out.push({
                    productId: pid,
                    offerId,
                    name,
                    description,
                    imageUrl: imageUrl || undefined,
                    price: typeof price === 'number' && !isNaN(price) ? price : undefined,
                    barcode: barcode || undefined,
                    weight: inf?.weight,
                    width: inf?.width,
                    height: inf?.height,
                    length: inf?.depth,
                    ozonCategoryId: typeof catId === 'number' && catId > 0 ? catId : undefined,
                    ozonTypeId: typeof typeId === 'number' && typeId > 0 ? typeId : undefined,
                });
            }
        }
        return out;
    }
    async syncProducts(products) {
        const result = { success: true, syncedCount: 0, failedCount: 0, errors: [], createdMappings: [] };
        for (const product of products) {
            try {
                if (product.ozonProductId) {
                    const ok = await this.updateProduct(product.ozonProductId, product);
                    if (ok) {
                        result.syncedCount++;
                    }
                    else {
                        result.failedCount++;
                        result.errors?.push(`Товар ${product.name}: ошибка обновления на Ozon`);
                    }
                }
                else {
                    const ozonProductId = await this.uploadProduct(product);
                    result.syncedCount++;
                    const offerId = this.sanitizeOfferId(product.vendorCode ?? `HS_${product.id.slice(0, 8)}`);
                    result.createdMappings?.push({
                        productId: product.id,
                        externalSystemId: ozonProductId,
                        externalArticle: offerId,
                    });
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
    async getStatistics() {
        try {
            const dateFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
            const dateFromStr = dateFrom.toISOString().split('T')[0];
            const dateToStr = new Date().toISOString().split('T')[0];
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v1/analytics/data`, {
                date_from: dateFromStr,
                date_to: dateToStr,
                dimension: ['day'],
                metrics: ['revenue', 'orders_count'],
                limit: 100,
            }, {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
            }));
            const rows = data?.result?.data ?? [];
            const revenue = rows.reduce((sum, day) => sum + (day.metrics?.[0] ?? 0), 0);
            const totalOrders = rows.reduce((sum, day) => sum + (day.metrics?.[1] ?? 0), 0);
            const { data: productsData } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v2/product/list`, { limit: 1000, offset: 0 }, {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
            }));
            return {
                totalProducts: productsData?.result?.total ?? 0,
                totalOrders,
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
exports.OzonAdapter = OzonAdapter;
exports.OzonAdapter = OzonAdapter = OzonAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [crypto_service_1.CryptoService,
        axios_1.HttpService, Object])
], OzonAdapter);
//# sourceMappingURL=ozon.adapter.js.map