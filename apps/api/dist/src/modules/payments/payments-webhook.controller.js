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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsWebhookController = void 0;
const common_1 = require("@nestjs/common");
const payments_service_1 = require("./payments.service");
const payments_webhook_guard_1 = require("./payments-webhook.guard");
let PaymentsWebhookController = class PaymentsWebhookController {
    constructor(paymentsService) {
        this.paymentsService = paymentsService;
    }
    async handleVtbWebhook(req, res) {
        await this.paymentsService.handleVtbWebhook({
            body: req.body,
            ip: req.ip ?? req.socket?.remoteAddress,
            headers: req.headers,
        });
        res.status(200).send('OK');
    }
};
exports.PaymentsWebhookController = PaymentsWebhookController;
__decorate([
    (0, common_1.Post)('vtb'),
    (0, common_1.UseGuards)(payments_webhook_guard_1.PaymentsWebhookGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PaymentsWebhookController.prototype, "handleVtbWebhook", null);
exports.PaymentsWebhookController = PaymentsWebhookController = __decorate([
    (0, common_1.Controller)('payments/webhook'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], PaymentsWebhookController);
//# sourceMappingURL=payments-webhook.controller.js.map