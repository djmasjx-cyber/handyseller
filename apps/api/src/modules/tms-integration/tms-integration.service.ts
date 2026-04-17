import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import type {
  CarrierCode,
  CarrierConnectionRecord,
  CarrierServiceType,
  ClientOrderRecord,
  CoreOrderSnapshot,
  InternalCarrierCredentials,
  OrderLogisticsScenario,
  UpsertCarrierConnectionInput,
} from '@handyseller/tms-sdk';

@Injectable()
export class TmsIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async listOrderCandidates(userId: string): Promise<ClientOrderRecord[]> {
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
      logisticsScenario: this.resolveLogisticsScenario(order.marketplace),
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
      logisticsScenario: this.resolveLogisticsScenario(order.marketplace),
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

  async listCarrierConnections(userId: string): Promise<CarrierConnectionRecord[]> {
    const connections = await this.prisma.carrierConnection.findMany({
      where: { userId },
      orderBy: [{ carrierCode: 'asc' }, { isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return connections.map((connection) => this.toCarrierConnectionRecord(connection));
  }

  async upsertCarrierConnection(
    userId: string,
    input: UpsertCarrierConnectionInput,
  ): Promise<CarrierConnectionRecord> {
    const carrierCode = input.carrierCode;
    const serviceType = input.serviceType ?? 'EXPRESS';
    const login = input.login.trim();
    const password = input.password.trim();

    if (!login || !password) {
      throw new BadRequestException('Укажите логин и пароль перевозчика.');
    }

    if (carrierCode === 'MAJOR_EXPRESS') {
      await this.validateMajorCredentials(login, password);
    }

    const target =
      input.id != null
        ? await this.prisma.carrierConnection.findFirst({
            where: { id: input.id, userId },
          })
        : await this.prisma.carrierConnection.findFirst({
            where: { userId, carrierCode, serviceType },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          });

    if (input.isDefault === true) {
      await this.prisma.carrierConnection.updateMany({
        where: {
          userId,
          carrierCode,
          serviceType,
          NOT: target ? { id: target.id } : undefined,
        },
        data: { isDefault: false },
      });
    }

    const data = {
      carrierCode,
      serviceType,
      accountLabel: input.accountLabel?.trim() || null,
      contractLabel: input.contractLabel?.trim() || null,
      login: this.crypto.encrypt(login),
      password: this.crypto.encrypt(password),
      isDefault: input.isDefault ?? true,
      lastValidatedAt: new Date(),
      lastError: null,
    };

    const connection = target
      ? await this.prisma.carrierConnection.update({
          where: { id: target.id },
          data,
        })
      : await this.prisma.carrierConnection.create({
          data: {
            userId,
            ...data,
          },
        });

    return this.toCarrierConnectionRecord(connection);
  }

  async deleteCarrierConnection(userId: string, id: string): Promise<void> {
    const connection = await this.prisma.carrierConnection.findFirst({
      where: { id, userId },
    });
    if (!connection) {
      throw new NotFoundException('Подключение перевозчика не найдено');
    }
    await this.prisma.carrierConnection.delete({ where: { id } });
  }

  async getInternalCarrierCredentials(
    userId: string,
    carrierCode: CarrierCode,
    serviceType: CarrierServiceType = 'EXPRESS',
  ): Promise<InternalCarrierCredentials | null> {
    const connection = await this.prisma.carrierConnection.findFirst({
      where: { userId, carrierCode, serviceType },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    if (!connection) {
      return null;
    }
    return {
      id: connection.id,
      carrierCode: connection.carrierCode,
      serviceType: connection.serviceType,
      accountLabel: connection.accountLabel,
      contractLabel: connection.contractLabel,
      login: this.crypto.decrypt(connection.login),
      password: this.crypto.decrypt(connection.password),
    };
  }

  private resolveLogisticsScenario(marketplace: string): OrderLogisticsScenario {
    return marketplace === 'MANUAL' ? 'CARRIER_DELIVERY' : 'MARKETPLACE_RC';
  }

  private toCarrierConnectionRecord(connection: {
    id: string;
    carrierCode: CarrierCode;
    serviceType: CarrierServiceType;
    accountLabel: string | null;
    contractLabel: string | null;
    login: string;
    isDefault: boolean;
    lastValidatedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): CarrierConnectionRecord {
    const login = this.crypto.decryptOptional(connection.login);
    return {
      id: connection.id,
      carrierCode: connection.carrierCode,
      serviceType: connection.serviceType,
      accountLabel: connection.accountLabel,
      contractLabel: connection.contractLabel,
      loginPreview: login ? this.maskLogin(login) : null,
      isDefault: connection.isDefault,
      lastValidatedAt: connection.lastValidatedAt?.toISOString() ?? null,
      lastError: connection.lastError,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }

  private maskLogin(login: string): string {
    if (login.length <= 4) {
      return `${login[0] ?? '*'}***`;
    }
    return `${login.slice(0, 2)}***${login.slice(-2)}`;
  }

  private async validateMajorCredentials(login: string, password: string): Promise<void> {
    const res = await fetch('https://ed.major-express.ru/edclients2.asmx', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`,
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"http://ltl-ws.major-express.ru/edclients/dict_Consignees"',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <dict_Consignees xmlns="http://ltl-ws.major-express.ru/edclients/" />
  </soap:Body>
</soap:Envelope>`,
    }).catch((error) => {
      throw new BadRequestException(`Не удалось проверить Major Express: ${String(error)}`);
    });

    if (!res.ok) {
      throw new BadRequestException('Major Express отклонил логин/пароль или сервис временно недоступен.');
    }
  }
}
