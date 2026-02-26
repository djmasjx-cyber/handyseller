import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class MaterialsService {
  constructor(
    private prisma: PrismaService,
    private subscriptionsService: SubscriptionsService,
  ) {}

  async findAll(userId: string) {
    const limits = await this.subscriptionsService.getLimits(userId);
    if (!limits.materialsAllowed) {
      return [];
    }
    return this.prisma.material.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async create(userId: string, data: { name: string; cost: number; unit?: string }) {
    const limits = await this.subscriptionsService.getLimits(userId);
    if (!limits.materialsAllowed) {
      throw new BadRequestException(
        'Учёт материалов доступен на плане «Профессиональный». Перейдите в раздел «Подписка».',
      );
    }
    return this.prisma.material.create({
      data: { ...data, userId, unit: data.unit ?? 'шт' },
    });
  }
}
