import { Injectable } from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

export interface SubscriptionLimits {
  maxProducts: number;
  maxMarketplaces: number;
  materialsAllowed: boolean;
}

/** Лимиты по планам: FREE 5/1, PROFESSIONAL 20/2, BUSINESS ∞ */
const PLAN_LIMITS: Record<string, SubscriptionLimits> = {
  FREE: { maxProducts: 5, maxMarketplaces: 1, materialsAllowed: false },
  PROFESSIONAL: { maxProducts: 20, maxMarketplaces: 2, materialsAllowed: false },
  BUSINESS: { maxProducts: 999_999, maxMarketplaces: 99, materialsAllowed: true },
};

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async findForUser(userId: string) {
    let sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (!sub) {
      sub = await this.prisma.subscription.create({
        data: { userId, plan: 'FREE' },
      });
    }
    return sub;
  }

  /** Админ: обновить план и/или дату истечения подписки */
  async updatePlan(
    userId: string,
    plan: SubscriptionPlan,
    expiresAt?: Date | null,
  ) {
    const sub = await this.findForUser(userId);
    const data: { plan: SubscriptionPlan; expiresAt?: Date | null } = { plan };
    if (expiresAt !== undefined) data.expiresAt = expiresAt;
    else if (plan !== 'FREE') {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      data.expiresAt = d;
    } else {
      data.expiresAt = null;
    }
    return this.prisma.subscription.update({
      where: { id: sub.id },
      data,
    });
  }

  /** Лимиты с учётом истечения подписки — просрочен = FREE */
  async getLimits(userId: string): Promise<SubscriptionLimits> {
    const sub = await this.findForUser(userId);
    const isExpired = sub.expiresAt ? new Date(sub.expiresAt) < new Date() : false;
    const plan = isExpired ? 'FREE' : sub.plan;
    return PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
  }
}
