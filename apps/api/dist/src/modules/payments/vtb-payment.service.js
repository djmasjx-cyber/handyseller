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
exports.VtbPaymentService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
const vtb_config_1 = require("./vtb.config");
let VtbPaymentService = class VtbPaymentService {
    get userName() {
        return this.config.get('VTB_USER_NAME') ?? vtb_config_1.VTB_CONFIG.userName;
    }
    get password() {
        return this.config.get('VTB_PASSWORD') ?? vtb_config_1.VTB_CONFIG.password;
    }
    get apiUrl() {
        return vtb_config_1.VTB_CONFIG.apiUrl;
    }
    constructor(config) {
        this.config = config;
    }
    get isConfigured() {
        return Boolean(this.userName && this.password);
    }
    async register(params) {
        const amountKopecks = Math.round(params.amount * 100);
        const body = new URLSearchParams({
            userName: this.userName,
            password: this.password,
            orderNumber: params.orderNumber,
            amount: String(amountKopecks),
            currency: params.currency ?? '643',
            returnUrl: params.returnUrl,
            failUrl: params.failUrl,
            description: params.description ?? `Оплата ${params.orderNumber}`,
            language: 'ru',
        });
        if (params.email)
            body.set('email', params.email);
        const { data } = await axios_1.default.post(`${this.apiUrl}/register.do`, body.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000,
        });
        if (data.errorCode && data.errorCode !== 0) {
            throw new Error(data.errorMessage ?? `VTB error: ${data.errorCode}`);
        }
        if (!data.orderId || !data.formUrl) {
            throw new Error('VTB did not return orderId or formUrl');
        }
        return { orderId: data.orderId, formUrl: data.formUrl };
    }
    async getOrderStatus(vtbOrderId) {
        const body = new URLSearchParams({
            userName: this.userName,
            password: this.password,
            orderId: vtbOrderId,
        });
        const { data } = await axios_1.default.post(`${this.apiUrl}/getOrderStatusExtended.do`, body.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000,
        });
        if (data.errorCode && data.errorCode !== 0) {
            throw new Error(data.errorMessage ?? `VTB error: ${data.errorCode}`);
        }
        return {
            orderStatus: data.orderStatus ?? -1,
            actionCode: data.actionCode,
            orderNumber: data.orderNumber,
        };
    }
    isPaid(status) {
        return status.orderStatus === 1 || status.orderStatus === 2;
    }
    async refund(vtbOrderId, amount) {
        const amountKopecks = Math.round(amount * 100);
        const body = new URLSearchParams({
            userName: this.userName,
            password: this.password,
            orderId: vtbOrderId,
            amount: String(amountKopecks),
        });
        const { data } = await axios_1.default.post(`${this.apiUrl}/refund.do`, body.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000,
        });
        if (data.errorCode && data.errorCode !== 0) {
            throw new Error(data.errorMessage ?? `VTB refund error: ${data.errorCode}`);
        }
    }
};
exports.VtbPaymentService = VtbPaymentService;
exports.VtbPaymentService = VtbPaymentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], VtbPaymentService);
//# sourceMappingURL=vtb-payment.service.js.map