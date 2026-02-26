import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { VtbPaymentService } from './vtb-payment.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private vtb: VtbPaymentService,
    private crypto: CryptoService,
  ) {}

  async createForSubscription(params: {
    userId: string;
    subscriptionId: string;
    amount: number;
    targetPlan: 'PROFESSIONAL' | 'BUSINESS';
    returnUrl: string;
    failUrl: string;
    idempotencyKey?: string;
  }) {
    if (!this.vtb.isConfigured) {
      throw new BadRequestException('Платёжная система не настроена');
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { id: params.subscriptionId },
    });
    if (!sub || sub.userId !== params.userId) {
      throw new BadRequestException('Подписка не найдена');
    }

    if (params.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) {
        return this.formatPayment(existing);
      }
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId: params.userId,
        amount: params.amount,
        subjectType: 'subscription',
        subjectId: params.subscriptionId,
        status: 'PENDING',
        idempotencyKey: params.idempotencyKey,
        metadata: { targetPlan: params.targetPlan },
      },
    });

    const planLabel = params.targetPlan === 'BUSINESS' ? 'Профессиональный' : 'Любительский';
    const vtbResult = await this.vtb.register({
      orderNumber: payment.id,
      amount: params.amount,
      returnUrl: params.returnUrl,
      failUrl: params.failUrl,
      description: `Подписка HandySeller: ${planLabel}`,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        vtbOrderId: vtbResult.orderId,
        status: 'PROCESSING',
      },
    });

    return {
      paymentId: payment.id,
      formUrl: vtbResult.formUrl,
      vtbOrderId: vtbResult.orderId,
    };
  }

  async getStatus(paymentId: string, userId?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) return null;
    if (userId && payment.userId !== userId) return null;

    if (['PENDING', 'PROCESSING'].includes(payment.status) && payment.vtbOrderId) {
      try {
        const vtbStatus = await this.vtb.getOrderStatus(payment.vtbOrderId);
        if (this.vtb.isPaid(vtbStatus)) {
          await this.handlePaymentSuccess(payment.id);
          const updated = await this.prisma.payment.findUnique({
            where: { id: paymentId },
          });
          return updated ? this.formatPayment(updated) : null;
        }
      } catch {
        // ignore, return current state
      }
    }

    return this.formatPayment(payment);
  }

  private async handlePaymentSuccess(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.status === 'SUCCEEDED') return;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'SUCCEEDED' },
      });

      if (payment.subjectType === 'subscription' && payment.subjectId) {
        const sub = await tx.subscription.findUnique({
          where: { id: payment.subjectId },
        });
        if (sub) {
          const metadata = payment.metadata as { targetPlan?: string } | null;
          const targetPlan = (metadata?.targetPlan === 'BUSINESS' || metadata?.targetPlan === 'PROFESSIONAL')
            ? metadata.targetPlan
            : 'PROFESSIONAL';
          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + 1);
          await tx.subscription.update({
            where: { id: payment.subjectId },
            data: {
              plan: targetPlan,
              expiresAt,
            },
          });
        }
      }
    });
  }

  async findByIdForAdmin(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: { select: { id: true, email: true, emailEncrypted: true, name: true } },
      },
    });
    if (!payment) return null;
    const userEmail =
      payment.user.emailEncrypted
        ? this.crypto.decryptOptional(payment.user.emailEncrypted)
        : payment.user.email;
    return {
      id: payment.id,
      userId: payment.userId,
      userEmail,
      userName: payment.user.name,
      amount: Number(payment.amount),
      status: payment.status,
      subjectType: payment.subjectType,
      subjectId: payment.subjectId,
      vtbOrderId: payment.vtbOrderId,
      paymentMethod: payment.paymentMethod,
      refundable: payment.refundable,
      refundedAmount: Number(payment.refundedAmount),
      idempotencyKey: payment.idempotencyKey,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }

  async getStatsForAdmin() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, succeeded, failed, processing, refunded, revenueResult, refundedResult, monthlyResult, webhooksUnprocessed] =
      await Promise.all([
        this.prisma.payment.count(),
        this.prisma.payment.count({ where: { status: 'SUCCEEDED' } }),
        this.prisma.payment.count({ where: { status: 'FAILED' } }),
        this.prisma.payment.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
        this.prisma.payment.count({ where: { status: 'REFUNDED' } }),
        this.prisma.payment.aggregate({
          where: { status: 'SUCCEEDED' },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.payment.aggregate({
          where: { status: 'REFUNDED' },
          _sum: { refundedAmount: true },
          _count: true,
        }),
        this.prisma.payment.aggregate({
          where: { status: 'SUCCEEDED', createdAt: { gte: startOfMonth } },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.vtbWebhook.count({
          where: { processed: false },
        }),
      ]);

    return {
      payments: { total, succeeded, failed, processing, refunded },
      revenue: Number(revenueResult._sum.amount ?? 0),
      revenueCount: revenueResult._count,
      monthlyRevenue: Number(monthlyResult._sum.amount ?? 0),
      monthlyRevenueCount: monthlyResult._count,
      refundedTotal: Number(refundedResult._sum.refundedAmount ?? 0),
      refundedCount: refundedResult._count,
      webhooksUnprocessed,
    };
  }

  async findAllForAdmin(opts?: { skip?: number; take?: number }) {
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        skip: opts?.skip ?? 0,
        take: Math.min(opts?.take ?? 50, 100),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, emailEncrypted: true, name: true } },
        },
      }),
      this.prisma.payment.count(),
    ]);

    return {
      payments: payments.map((p) => {
        const userEmail =
          p.user.emailEncrypted ? this.crypto.decryptOptional(p.user.emailEncrypted) : p.user.email;
        return {
          id: p.id,
          userId: p.userId,
          userEmail,
        userName: p.user.name,
        amount: Number(p.amount),
        status: p.status,
        subjectType: p.subjectType,
        subjectId: p.subjectId,
        vtbOrderId: p.vtbOrderId,
        createdAt: p.createdAt.toISOString(),
        };
      }),
      total,
    };
  }

  async findAllWebhooksForAdmin(opts?: { skip?: number; take?: number }) {
    const [webhooks, total] = await Promise.all([
      this.prisma.vtbWebhook.findMany({
        skip: opts?.skip ?? 0,
        take: Math.min(opts?.take ?? 50, 100),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vtbWebhook.count(),
    ]);

    return {
      webhooks: webhooks.map((w) => ({
        id: w.id,
        eventType: w.eventType,
        vtbOrderId: w.vtbOrderId,
        paymentId: w.paymentId,
        processed: w.processed,
        processingError: w.processingError,
        ipAddress: w.ipAddress,
        createdAt: w.createdAt.toISOString(),
        payload: w.payload,
      })),
      total,
    };
  }

  /**
   * Возврат платежа (только для админа).
   */
  async refund(paymentId: string, amount?: number): Promise<{ refunded: number }> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new BadRequestException('Платёж не найден');
    }
    if (payment.status !== 'SUCCEEDED') {
      throw new BadRequestException('Возврат возможен только для оплаченных платежей');
    }
    if (!payment.refundable) {
      throw new BadRequestException('Платёж не подлежит возврату');
    }
    if (!payment.vtbOrderId) {
      throw new BadRequestException('Нет привязки к ВТБ');
    }

    const refundedSoFar = Number(payment.refundedAmount);
    const totalAmount = Number(payment.amount);
    const maxRefund = totalAmount - refundedSoFar;
    if (maxRefund <= 0) {
      throw new BadRequestException('Полный возврат уже выполнен');
    }

    const refundAmount = amount ?? maxRefund;
    if (refundAmount <= 0 || refundAmount > maxRefund) {
      throw new BadRequestException(`Сумма возврата должна быть от 0.01 до ${maxRefund}`);
    }

    await this.vtb.refund(payment.vtbOrderId, refundAmount);

    const newRefunded = refundedSoFar + refundAmount;
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        refundedAmount: newRefunded,
        status: newRefunded >= totalAmount ? 'REFUNDED' : payment.status,
      },
    });

    return { refunded: refundAmount };
  }

  /**
   * Обработка вебхука ВТБ (dynamicCallbackUrl).
   * Сохраняет payload в VtbWebhook, при успешной оплате обновляет Payment и Subscription.
   */
  async handleVtbWebhook(params: {
    body: unknown;
    ip?: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    const payload = typeof params.body === 'object' && params.body !== null
      ? params.body
      : { raw: String(params.body) };
    const vtbOrderId = this.extractVtbOrderId(payload);
    const isSuccess = this.isSuccessPayload(payload);

    const webhook = await this.prisma.vtbWebhook.create({
      data: {
        eventType: 'payment_callback',
        vtbOrderId: vtbOrderId ?? undefined,
        payload: payload as object,
        ipAddress: params.ip,
        processed: false,
      },
    });

    if (vtbOrderId && isSuccess) {
      try {
        const payment = await this.prisma.payment.findUnique({
          where: { vtbOrderId },
        });
        if (payment && payment.status !== 'SUCCEEDED') {
          await this.handlePaymentSuccess(payment.id);
        }
        await this.prisma.vtbWebhook.update({
          where: { id: webhook.id },
          data: { processed: true, paymentId: payment?.id },
        });
      } catch (err) {
        await this.prisma.vtbWebhook.update({
          where: { id: webhook.id },
          data: {
            processed: false,
            processingError: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }

  private extractVtbOrderId(payload: unknown): string | null {
    if (payload && typeof payload === 'object') {
      const o = payload as Record<string, unknown>;
      const id = o.orderId ?? o.mdOrder ?? o.order_id;
      if (typeof id === 'string' && id) return id;
    }
    return null;
  }

  private isSuccessPayload(payload: unknown): boolean {
    if (payload && typeof payload === 'object') {
      const o = payload as Record<string, unknown>;
      const status = o.orderStatus ?? o.order_status ?? o.paymentStatus ?? o.status;
      if (status === 1 || status === 2 || status === 'PAID' || status === 'success') return true;
      if (typeof status === 'string' && /^(1|2|paid|success)$/i.test(status)) return true;
    }
    return false;
  }

  private formatPayment(p: { id: string; amount: unknown; status: string; vtbOrderId: string | null }) {
    return {
      paymentId: p.id,
      id: p.id,
      amount: Number(p.amount),
      status: p.status,
      vtbOrderId: p.vtbOrderId,
    };
  }
}
