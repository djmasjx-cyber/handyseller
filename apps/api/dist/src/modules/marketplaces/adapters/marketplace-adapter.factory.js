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
exports.MarketplaceAdapterFactory = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const crypto_service_1 = require("../../../common/crypto/crypto.service");
const wildberries_adapter_1 = require("./wildberries.adapter");
const ozon_adapter_1 = require("./ozon.adapter");
const yandex_adapter_1 = require("./yandex.adapter");
const avito_adapter_1 = require("./avito.adapter");
let MarketplaceAdapterFactory = class MarketplaceAdapterFactory {
    constructor(crypto, httpService) {
        this.crypto = crypto;
        this.httpService = httpService;
    }
    createWildberriesAdapter(connection) {
        const apiKey = this.crypto.decrypt(connection.encryptedToken);
        const statsToken = connection.encryptedStatsToken
            ? this.crypto.decrypt(connection.encryptedStatsToken)
            : undefined;
        const config = {
            apiKey,
            sellerId: connection.sellerId,
            warehouseId: connection.warehouseId,
            statsToken,
            baseUrl: 'https://seller.wildberries.ru',
        };
        return new wildberries_adapter_1.WildberriesAdapter(this.crypto, this.httpService, config);
    }
    createOzonAdapter(connection) {
        const apiKey = this.crypto.decrypt(connection.encryptedToken);
        const config = {
            apiKey,
            sellerId: connection.sellerId,
            warehouseId: connection.warehouseId,
            baseUrl: 'https://seller.ozon.ru',
        };
        return new ozon_adapter_1.OzonAdapter(this.crypto, this.httpService, config);
    }
    createYandexAdapter(connection) {
        const apiKey = this.crypto.decrypt(connection.encryptedToken);
        const config = {
            apiKey,
            sellerId: connection.sellerId,
            baseUrl: 'https://partner.market.yandex.ru',
        };
        return new yandex_adapter_1.YandexAdapter(this.crypto, this.httpService, config);
    }
    createAvitoAdapter(connection) {
        const apiKey = this.crypto.decrypt(connection.encryptedToken);
        const config = {
            apiKey,
            sellerId: connection.sellerId,
            baseUrl: 'https://www.avito.ru',
        };
        return new avito_adapter_1.AvitoAdapter(this.crypto, this.httpService, config);
    }
    createAdapter(marketplace, connection) {
        if (marketplace === 'WILDBERRIES')
            return this.createWildberriesAdapter(connection);
        if (marketplace === 'OZON')
            return this.createOzonAdapter(connection);
        if (marketplace === 'YANDEX')
            return this.createYandexAdapter(connection);
        if (marketplace === 'AVITO')
            return this.createAvitoAdapter(connection);
        return null;
    }
};
exports.MarketplaceAdapterFactory = MarketplaceAdapterFactory;
exports.MarketplaceAdapterFactory = MarketplaceAdapterFactory = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [crypto_service_1.CryptoService,
        axios_1.HttpService])
], MarketplaceAdapterFactory);
//# sourceMappingURL=marketplace-adapter.factory.js.map