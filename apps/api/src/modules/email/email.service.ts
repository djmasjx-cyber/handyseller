import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { LoggerService } from '../../common/logger/logger.service';

@Injectable()
export class EmailService {
  private transporter: Transporter | null = null;
  private resend: Resend | null = null;
  private readonly from: string;
  private readonly isConfigured: boolean;
  private etherealPromise: Promise<void> | null = null;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    const resendKey = this.config.get('RESEND_API_KEY');
    const host = this.config.get('SMTP_HOST');
    const user = this.config.get('SMTP_USER');
    const pass = this.config.get('SMTP_PASS');
    this.from = this.config.get('EMAIL_FROM') ?? 'HandySeller <onboarding@resend.dev>';

    if (resendKey) {
      this.resend = new Resend(resendKey);
      this.isConfigured = true;
      this.logger.info('Email: Resend API настроен');
    } else if (host && user && pass) {
      const port = this.config.get('SMTP_PORT');
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(String(port ?? 587), 10),
        secure: port === '465',
        auth: { user, pass },
      });
      this.isConfigured = true;
      this.logger.info('Email: SMTP настроен');
    } else {
      this.isConfigured = false;
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn('Email: не настроен. В dev будет использован Ethereal (test inbox)');
      }
    }
  }

  /** Для dev: создать тестовый аккаунт Ethereal (реальная почта в тестовый inbox) */
  private async ensureEthereal(): Promise<Transporter> {
    if (this.transporter) return this.transporter;
    if (this.etherealPromise) {
      await this.etherealPromise;
      return this.transporter!;
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
    return this.transporter!;
  }

  async sendVerificationCode(email: string, code: string): Promise<boolean> {
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
        if (error) throw new Error(error.message);
        this.logger.info('Verification email sent (Resend)', { email: email.substring(0, 3) + '***' });
        return true;
      } catch (err) {
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
      } catch (err) {
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
      } catch (err) {
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

  async sendPasswordResetLink(email: string, resetUrl: string): Promise<boolean> {
    const subject = 'Восстановление пароля HandySeller';
    const html = `
      <p>Вы запросили восстановление пароля.</p>
      <p><a href="${resetUrl}">Сбросить пароль</a></p>
      <p>Ссылка действует 30 минут и может быть использована только один раз.</p>
      <p>Если вы не запрашивали восстановление, просто проигнорируйте письмо.</p>
    `;

    if (this.resend) {
      try {
        const { error } = await this.resend.emails.send({
          from: this.from,
          to: email,
          subject,
          html,
        });
        if (error) throw new Error(error.message);
        this.logger.info('Password reset email sent (Resend)', { email: `${email.substring(0, 3)}***` });
        return true;
      } catch (err) {
        this.logger.error('Resend password reset send failed', {
          email: `${email.substring(0, 3)}***`,
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
        this.logger.info('Password reset email sent (SMTP)', { email: `${email.substring(0, 3)}***` });
        return true;
      } catch (err) {
        this.logger.error('SMTP password reset send failed', {
          email: `${email.substring(0, 3)}***`,
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
        this.logger.info(`[DEV] Password reset email in Ethereal: ${nodemailer.getTestMessageUrl(info) ?? ''}`);
        return true;
      } catch (err) {
        this.logger.error('Ethereal password reset send failed', {
          email: `${email.substring(0, 3)}***`,
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      }
    }

    this.logger.warn('Password reset email provider is not configured');
    return false;
  }
}
