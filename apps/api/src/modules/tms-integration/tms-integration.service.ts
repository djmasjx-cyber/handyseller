import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { CoreOrderSnapshot } from '@handyseller/tms-sdk';

@Injectable()
export class TmsIntegrationService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrderCandidates(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        userId,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        externalId: true,
        marketplace: true,
        status: true,
        totalAmount: true,
        warehouseName: true,
        createdAt: true,
        items: {
          include: {
            product: {
              select: {
                title: true,
                article: true,
              },
            },
          },
        },
      },
    });

    return orders.map((order) => ({
      id: order.id,
      externalId: order.externalId,
      marketplace: order.marketplace,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      warehouseName: order.warehouseName,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        title: item.product?.title ?? item.product?.article ?? 'Товар',
        quantity: item.quantity,
      })),
    }));
  }

  async buildOrderSnapshot(userId: string, orderId: string): Promise<CoreOrderSnapshot> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                weight: true,
                width: true,
                length: true,
                height: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    const totalWeightGrams = order.items.reduce(
      (sum, item) => sum + (item.product?.weight ?? 0) * item.quantity,
      0,
    );
    const maxWidthMm = order.items.reduce(
      (max, item) => Math.max(max, item.product?.width ?? 0),
      0,
    );
    const maxLengthMm = order.items.reduce(
      (max, item) => Math.max(max, item.product?.length ?? 0),
      0,
    );
    const totalHeightMm = order.items.reduce(
      (sum, item) => sum + (item.product?.height ?? 0) * item.quantity,
      0,
    );

    return {
      sourceSystem: 'HANDYSELLER_CORE',
      userId,
      coreOrderId: order.id,
      coreOrderNumber: order.externalId,
      marketplace: order.marketplace,
      createdAt: order.createdAt.toISOString(),
      originLabel: order.warehouseName ?? null,
      destinationLabel: order.marketplace === 'MANUAL' ? 'Ручной канал' : `${order.marketplace} order`,
      cargo: {
        weightGrams: totalWeightGrams,
        widthMm: maxWidthMm || null,
        lengthMm: maxLengthMm || null,
        heightMm: totalHeightMm || null,
        places: Math.max(order.items.length, 1),
        declaredValueRub: Number(order.totalAmount),
      },
      itemSummary: order.items.map((item) => ({
        productId: item.product?.id ?? null,
        title: item.product?.title ?? 'Товар',
        quantity: item.quantity,
        weightGrams: item.product?.weight ?? null,
      })),
    };
  }
}
