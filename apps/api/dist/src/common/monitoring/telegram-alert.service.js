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
exports.TelegramAlertService = void 0;
const common_1 = require("@nestjs/common");
let TelegramAlertService = class TelegramAlertService {
    constructor() {
        this.botToken = process.env.TELEGRAM_ALERT_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_ALERT_CHAT_ID;
    }
    async sendAlert(message, context) {
        if (!this.botToken || !this.chatId)
            return;
        const text = [
            '🚨 *HandySeller API Error*',
            '',
            message,
            '',
            context ? '```' + JSON.stringify(context, null, 2) + '```' : '',
        ]
            .filter(Boolean)
            .join('\n');
        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                }),
            });
        }
        catch (err) {
            console.error('[TelegramAlert] Failed to send:', err);
        }
    }
};
exports.TelegramAlertService = TelegramAlertService;
exports.TelegramAlertService = TelegramAlertService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], TelegramAlertService);
//# sourceMappingURL=telegram-alert.service.js.map