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
exports.AvitoAdapter = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const base_marketplace_adapter_1 = require("./base-marketplace.adapter");
const crypto_service_1 = require("../../../common/crypto/crypto.service");
let AvitoAdapter = class AvitoAdapter extends base_marketplace_adapter_1.BaseMarketplaceAdapter {
    constructor(crypto, httpService, config) {
        super(crypto, {
            ...config,
            baseUrl: config.baseUrl || 'https://www.avito.ru',
        });
        this.API_BASE = 'https://api.avito.ru';
        this.accessToken = null;
        this.tokenExpiry = 0;
        this.httpService = httpService;
    }
    async getAccessToken() {
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }
        if (!this.config.sellerId || !this.config.apiKey) {
            throw new Error('clientId и clientSecret обязательны для Avito');
        }
        const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post('https://oauth.avito.ru/token', new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.config.sellerId,
            client_secret: this.config.apiKey,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }));
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
        return this.accessToken;
    }
    convertToPlatform(canonical) {
        return {
            category_id: 1070,
            price: canonical.price,
            title: canonical.title,
            description: canonical.long_description_plain ?? canonical.short_description ?? '',
            address: { region_id: 1, city_id: 621540 },
            contacts: { name: 'Мастер' },
            images: canonical.images?.map((i) => ({ url: i.url })) ?? [],
            param: canonical.attributes?.map((a) => ({ name: a.name, value: a.value })) ?? [],
        };
    }
    async authenticate() {
        try {
            await this.getAccessToken();
            return true;
        }
        catch (error) {
            this.logError(error, 'authenticate');
            return false;
        }
    }
    async uploadProduct(product) {
        try {
            const token = await this.getAccessToken();
            const avitoProduct = {
                category_id: 1070,
                price: product.price,
                title: product.name,
                description: product.description || '',
                address: { region_id: 1, city_id: 621540 },
                contacts: { name: 'Мастер' },
                images: product.images.map((img) => ({ url: img })),
                tags: ['ручная работа', 'хендмейд', 'уникально', 'подарок'],
                attributes: [
                    { id: 1001, value: 'Ручная работа' },
                    { id: 1002, value: 'Россия' },
                ],
            };
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/core/v1/items`, avitoProduct, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }));
            return String(data.id);
        }
        catch (error) {
            this.logError(error, 'uploadProduct');
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Ошибка выгрузки товара на Avito: ${msg}`);
        }
    }
    async updateProduct(marketplaceProductId, product) {
        try {
            const token = await this.getAccessToken();
            const updateData = {};
            if (product.price !== undefined)
                updateData.price = product.price;
            if (product.name !== undefined)
                updateData.title = product.name;
            if (product.description !== undefined)
                updateData.description = product.description;
            if (product.images?.length) {
                updateData.images = product.images.map((img) => ({ url: img }));
            }
            await (0, rxjs_1.firstValueFrom)(this.httpService.patch(`${this.API_BASE}/core/v1/items/${marketplaceProductId}`, updateData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }));
            return true;
        }
        catch (error) {
            this.logError(error, 'updateProduct');
            return false;
        }
    }
    async deleteProduct(marketplaceProductId) {
        try {
            const token = await this.getAccessToken();
            await (0, rxjs_1.firstValueFrom)(this.httpService.delete(`${this.API_BASE}/core/v1/items/${marketplaceProductId}`, {
                headers: { Authorization: `Bearer ${token}` },
            }));
            return true;
        }
        catch (error) {
            this.logError(error, 'deleteProduct');
            return false;
        }
    }
    async getOrders(since) {
        try {
            const token = await this.getAccessToken();
            const dateFrom = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.API_BASE}/messenger/v3/accounts/me/chats`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    created_at_from: Math.floor(dateFrom.getTime() / 1000),
                    limit: 100,
                },
            }));
            if (!data?.result)
                return [];
            return data.result.map((chat) => ({
                id: chat.id,
                marketplaceOrderId: chat.id,
                productId: chat.item_id?.toString() ?? '',
                customerName: chat.users?.find((u) => u.role === 'client')?.name ?? 'Аноним',
                status: 'NEW',
                amount: 0,
                createdAt: new Date((chat.last_message_at ?? 0) * 1000),
            }));
        }
        catch (error) {
            this.logError(error, 'getOrders');
            return [];
        }
    }
    async updateOrderStatus(_marketplaceOrderId, _status, _options) {
        return true;
    }
    async syncProducts(products) {
        const result = { success: true, syncedCount: 0, failedCount: 0, errors: [], createdMappings: [] };
        for (const product of products) {
            try {
                if (product.avitoProductId) {
                    const ok = await this.updateProduct(product.avitoProductId, {
                        price: product.price,
                        name: product.name,
                        description: product.description,
                        images: product.images,
                    });
                    if (ok)
                        result.syncedCount++;
                    else {
                        result.failedCount++;
                        result.errors?.push(`Товар ${product.name}: ошибка обновления на Avito`);
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
    async getStatistics() {
        try {
            const token = await this.getAccessToken();
            const { data: itemsData } = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.API_BASE}/core/v1/items`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { per_page: 100 },
            }));
            const activeItems = itemsData?.items?.filter((i) => i.status === 'active') ?? [];
            const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const { data: chatsData } = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.API_BASE}/messenger/v3/accounts/me/chats`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    created_at_from: Math.floor(dateFrom.getTime() / 1000),
                    limit: 1000,
                },
            }));
            return {
                totalProducts: activeItems.length,
                totalOrders: chatsData?.result?.length ?? 0,
                revenue: 0,
                lastSyncAt: new Date(),
            };
        }
        catch (error) {
            this.logError(error, 'getStatistics');
            return { totalProducts: 0, totalOrders: 0, revenue: 0, lastSyncAt: new Date() };
        }
    }
    async getItemStats(itemId) {
        try {
            const token = await this.getAccessToken();
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.API_BASE}/core/v1/items/${itemId}/stats`, {
                headers: { Authorization: `Bearer ${token}` },
            }));
            return data;
        }
        catch (error) {
            this.logError(error, 'getItemStats');
            return null;
        }
    }
};
exports.AvitoAdapter = AvitoAdapter;
exports.AvitoAdapter = AvitoAdapter = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [crypto_service_1.CryptoService,
        axios_1.HttpService, Object])
], AvitoAdapter);
//# sourceMappingURL=avito.adapter.js.map