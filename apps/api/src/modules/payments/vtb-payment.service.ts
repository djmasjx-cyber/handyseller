import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { VTB_CONFIG } from './vtb.config';

export interface VtbRegisterParams {
  orderNumber: string;
  amount: number;
  currency?: string;
  returnUrl: string;
  failUrl: string;
  description?: string;
  email?: string;
}

export interface VtbRegisterResult {
  orderId: string;
  formUrl: string;
}

export interface VtbOrderStatus {
  orderStatus: number;
  actionCode?: number;
  orderNumber?: string;
}

@Injectable()
export class VtbPaymentService {
  private get userName() {
    return this.config.get('VTB_USER_NAME') ?? VTB_CONFIG.userName;
  }
  private get password() {
    return this.config.get('VTB_PASSWORD') ?? VTB_CONFIG.password;
  }
  private get apiUrl() {
    return VTB_CONFIG.apiUrl;
  }

  constructor(private config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(this.userName && this.password);
  }

  /**
   * Регистрация заказа в ВТБ (register.do).
   * amount — в рублях, внутри конвертируется в копейки.
   */
  async register(params: VtbRegisterParams): Promise<VtbRegisterResult> {
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
    if (params.email) body.set('email', params.email);

    const { data } = await axios.post<{ orderId?: string; formUrl?: string; errorCode?: number; errorMessage?: string }>(
      `${this.apiUrl}/register.do`,
      body.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      },
    );

    if (data.errorCode && data.errorCode !== 0) {
      throw new Error(data.errorMessage ?? `VTB error: ${data.errorCode}`);
    }
    if (!data.orderId || !data.formUrl) {
      throw new Error('VTB did not return orderId or formUrl');
    }

    return { orderId: data.orderId, formUrl: data.formUrl };
  }

  /**
   * Получение статуса заказа (getOrderStatusExtended.do).
   * orderStatus: 1 или 2 = оплачен.
   */
  async getOrderStatus(vtbOrderId: string): Promise<VtbOrderStatus> {
    const body = new URLSearchParams({
      userName: this.userName,
      password: this.password,
      orderId: vtbOrderId,
    });

    const { data } = await axios.post<{
      orderStatus?: number;
      actionCode?: number;
      orderNumber?: string;
      errorCode?: number;
      errorMessage?: string;
    }>(`${this.apiUrl}/getOrderStatusExtended.do`, body.toString(), {
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

  /**
   * Проверка: оплачен ли заказ (orderStatus 1 или 2).
   */
  isPaid(status: VtbOrderStatus): boolean {
    return status.orderStatus === 1 || status.orderStatus === 2;
  }

  /**
   * Возврат платежа (refund.do).
   * amount — в рублях, внутри конвертируется в копейки.
   * Для частичного возврата укажите amount меньше суммы платежа.
   */
  async refund(vtbOrderId: string, amount: number): Promise<void> {
    const amountKopecks = Math.round(amount * 100);
    const body = new URLSearchParams({
      userName: this.userName,
      password: this.password,
      orderId: vtbOrderId,
      amount: String(amountKopecks),
    });

    const { data } = await axios.post<{ errorCode?: number; errorMessage?: string }>(
      `${this.apiUrl}/refund.do`,
      body.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      },
    );

    if (data.errorCode && data.errorCode !== 0) {
      throw new Error(data.errorMessage ?? `VTB refund error: ${data.errorCode}`);
    }
  }
}
