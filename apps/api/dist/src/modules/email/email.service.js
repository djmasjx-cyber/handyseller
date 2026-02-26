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
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = require("nodemailer");
const resend_1 = require("resend");
const logger_service_1 = require("../../common/logger/logger.service");
let EmailService = class EmailService {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.transporter = null;
        this.resend = null;
        this.etherealPromise = null;
        const resendKey = this.config.get('RESEND_API_KEY');
        const host = this.config.get('SMTP_HOST');
        const user = this.config.get('SMTP_USER');
        const pass = this.config.get('SMTP_PASS');
        this.from = this.config.get('EMAIL_FROM') ?? 'HandySeller <onboarding@resend.dev>';
        if (resendKey) {
            this.resend = new resend_1.Resend(resendKey);
            this.isConfigured = true;
            this.logger.info('Email: Resend API настроен');
        }
        else if (host && user && pass) {
            const port = this.config.get('SMTP_PORT');
            this.transporter = nodemailer.createTransport({
                host,
                port: parseInt(String(port ?? 587), 10),
                secure: port === '465',
                auth: { user, pass },
            });
            this.isConfigured = true;
            this.logger.info('Email: SMTP настроен');
        }
        else {
            this.isConfigured = false;
            if (process.env.NODE_ENV !== 'production') {
                this.logger.warn('Email: не настроен. В dev будет использован Ethereal (test inbox)');
            }
        }
    }
    async ensureEthereal() {
        if (this.transporter)
            return this.transporter;
        if (this.etherealPromise) {
            await this.etherealPromise;
            return this.transporter;
        }
        this.etherealPromise = (async () => {
            const account = await nodemailer.createTestAccount();
            this.transporter = nodemailer.createTransport({
                host: account.smtp.host,
                port: account.smtp.port,
                secure: account.smtp.secure,
                auth: { user: account.user, pass: account.pass },
            });
            this.logger.info(`[DEV] Ethereal inbox: https://ethereal.email/login?user=${account.user}`);
        })();
        await this.etherealPromise;
        return this.transporter;
    }
    async sendVerificationCode(email, code) {
        const subject = 'Код подтверждения HandySeller';
        const html = `
      <p>Ваш код для подтверждения регистрации:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
      <p>Код действителен 15 минут.</p>
      <p>Если вы не регистрировались на HandySeller, проигнорируйте это письмо.</p>
    `;
        if (this.resend) {
            try {
                const { error } = await this.resend.emails.send({
                    from: this.from,
                    to: email,
                    subject,
                    html,
                });
                if (error)
                    throw new Error(error.message);
                this.logger.info('Verification email sent (Resend)', { email: email.substring(0, 3) + '***' });
                return true;
            }
            catch (err) {
                this.logger.error('Resend send failed', {
                    email,
                    error: err instanceof Error ? err.message : String(err),
                });
                return false;
            }
        }
        if (this.transporter) {
            try {
                await this.transporter.sendMail({
                    from: this.from,
                    to: email,
                    subject,
                    html,
                });
                this.logger.info('Verification email sent (SMTP)', { email: email.substring(0, 3) + '***' });
                return true;
            }
            catch (err) {
                this.logger.error('SMTP send failed', {
                    email,
                    error: err instanceof Error ? err.message : String(err),
                });
                return false;
            }
        }
        if (process.env.NODE_ENV !== 'production') {
            const transport = await this.ensureEthereal();
            try {
                const info = await transport.sendMail({
                    from: this.from,
                    to: email,
                    subject,
                    html,
                });
                this.logger.info(`[DEV] Письмо отправлено в Ethereal: ${nodemailer.getTestMessageUrl(info) ?? ''}`);
                return true;
            }
            catch (err) {
                this.logger.error('Ethereal send failed', {
                    email,
                    error: err instanceof Error ? err.message : String(err),
                });
                return false;
            }
        }
        this.logger.info(`[DEV] Код для ${email}: ${code}`);
        return false;
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        logger_service_1.LoggerService])
], EmailService);
//# sourceMappingURL=email.service.js.map