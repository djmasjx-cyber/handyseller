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
exports.ConnectMarketplaceDto = exports.MarketplaceType = void 0;
const class_validator_1 = require("class-validator");
var MarketplaceType;
(function (MarketplaceType) {
    MarketplaceType["WILDBERRIES"] = "WILDBERRIES";
    MarketplaceType["OZON"] = "OZON";
    MarketplaceType["YANDEX"] = "YANDEX";
    MarketplaceType["AVITO"] = "AVITO";
})(MarketplaceType || (exports.MarketplaceType = MarketplaceType = {}));
class ConnectMarketplaceDto {
}
exports.ConnectMarketplaceDto = ConnectMarketplaceDto;
__decorate([
    (0, class_validator_1.IsNotEmpty)({ message: 'Укажите тип маркетплейса' }),
    (0, class_validator_1.IsEnum)(MarketplaceType, { message: 'Недопустимый тип маркетплейса' }),
    __metadata("design:type", String)
], ConnectMarketplaceDto.prototype, "marketplace", void 0);
__decorate([
    (0, class_validator_1.ValidateIf)((o) => !o.token),
    (0, class_validator_1.IsNotEmpty)({ message: 'Укажите apiKey или token' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(10, 5000, { message: 'API ключ должен быть от 10 до 5000 символов' }),
    __metadata("design:type", String)
], ConnectMarketplaceDto.prototype, "apiKey", void 0);
__decorate([
    (0, class_validator_1.ValidateIf)((o) => !o.apiKey),
    (0, class_validator_1.IsNotEmpty)({ message: 'Укажите apiKey или token' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(10, 5000),
    __metadata("design:type", String)
], ConnectMarketplaceDto.prototype, "token", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConnectMarketplaceDto.prototype, "refreshToken", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConnectMarketplaceDto.prototype, "sellerId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConnectMarketplaceDto.prototype, "warehouseId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(10, 5000, { message: 'Токен должен быть от 10 до 5000 символов' }),
    __metadata("design:type", String)
], ConnectMarketplaceDto.prototype, "statsToken", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConnectMarketplaceDto.prototype, "shopName", void 0);
//# sourceMappingURL=connect-marketplace.dto.js.map