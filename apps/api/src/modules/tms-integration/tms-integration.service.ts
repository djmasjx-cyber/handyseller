import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { SalesSourcesService } from '../sales-sources/sales-sources.service';
import { CreateTmsEstimateOrderDto } from './dto/create-tms-estimate-order.dto';
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
import { CoreToTmsSnapshotAcl } from './core-to-tms-snapshot.acl';

@Injectable()
export class TmsIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly salesSources: SalesSourcesService,
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
        deliveryAddressLabel: true,
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
      deliveryAddressLabel: order.deliveryAddressLabel,
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
    return CoreToTmsSnapshotAcl.map(userId, order);
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
    const login = (input.login ?? '').trim();
    const password = (input.password ?? '').trim();

    if (!login || !password) {
      throw new BadRequestException('Укажите логин и пароль перевозчика.');
    }

    if (carrierCode === 'MAJOR_EXPRESS') {
      await this.validateMajorCredentials(login, password);
    }
    if (carrierCode === 'CDEK') {
      await this.validateCdekCredentials(login, password);
    }
    if (carrierCode === 'DALLI') {
      await this.validateDalliCredentials(input.appKey?.trim() || login);
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

    let appKeyEncrypted: string | null = null;
    if (carrierCode === 'DELLIN' || carrierCode === 'DALLI') {
      const fromInput = (input.appKey ?? '').trim();
      if (fromInput) {
        appKeyEncrypted = this.crypto.encrypt(fromInput);
      } else if (target?.appKey) {
        appKeyEncrypted = target.appKey;
      } else if (carrierCode === 'DELLIN') {
        throw new BadRequestException(
          'Для Деловых Линий укажите ключ приложения (appKey) из раздела интеграций личного кабинета.',
        );
      } else {
        appKeyEncrypted = null;
      }
    }

    const data = {
      carrierCode,
      serviceType,
      accountLabel: input.accountLabel?.trim() || null,
      contractLabel: input.contractLabel?.trim() || null,
      appKey: carrierCode === 'DELLIN' || carrierCode === 'DALLI' ? appKeyEncrypted : null,
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

  async checkCarrierConnection(userId: string, id: string): Promise<CarrierConnectionRecord> {
    const connection = await this.prisma.carrierConnection.findFirst({
      where: { id, userId },
    });
    if (!connection) {
      throw new NotFoundException('Подключение перевозчика не найдено');
    }
    const login = this.crypto.decrypt(connection.login);
    const password = this.crypto.decrypt(connection.password);
    let lastError: string | null = null;
    try {
      if (connection.carrierCode === 'MAJOR_EXPRESS') {
        await this.validateMajorCredentials(login, password);
      } else if (connection.carrierCode === 'CDEK') {
        await this.validateCdekCredentials(login, password);
      } else if (connection.carrierCode === 'DELLIN') {
        const appKey = connection.appKey ? this.crypto.decrypt(connection.appKey) : null;
        await this.validateDellinCredentials(appKey, login, password);
      } else if (connection.carrierCode === 'DALLI') {
        const token = connection.appKey ? this.crypto.decrypt(connection.appKey) : login;
        await this.validateDalliCredentials(token);
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    const updated = await this.prisma.carrierConnection.update({
      where: { id: connection.id },
      data: {
        lastValidatedAt: new Date(),
        lastError,
      },
    });
    return this.toCarrierConnectionRecord(updated);
  }

  async checkAllCarrierConnections(userId: string): Promise<CarrierConnectionRecord[]> {
    const list = await this.prisma.carrierConnection.findMany({
      where: { userId },
      orderBy: [{ carrierCode: 'asc' }, { isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    const out: CarrierConnectionRecord[] = [];
    for (const item of list) {
      out.push(await this.checkCarrierConnection(userId, item.id));
    }
    return out;
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
      appKey: connection.appKey ? this.crypto.decrypt(connection.appKey) : null,
      login: this.crypto.decrypt(connection.login),
      password: this.crypto.decrypt(connection.password),
    };
  }

  async createTmsEstimateOrder(userId: string, dto: CreateTmsEstimateOrderDto) {
    const origin = dto.originAddress.trim();
    const dest = dto.destinationAddress.trim();
    const ext =
      dto.externalId?.trim() ||
      `TMS-${randomBytes(4).toString('hex').toUpperCase()}`;

    const existing = await this.prisma.order.findUnique({
      where: {
        userId_marketplace_externalId: {
          userId,
          marketplace: 'MANUAL',
          externalId: ext,
        },
      },
    });
    if (existing) {
      throw new BadRequestException(`Заказ с номером «${ext}» уже существует`);
    }

    const src = await this.salesSources.upsert(
      userId,
      (dto.salesSource?.trim() || 'Оценка перевозки').slice(0, 120),
    );

    const weightGrams = Math.round(dto.weightKg * 1000);
    const lengthMm = Math.round(dto.lengthCm * 10);
    const widthMm = Math.round(dto.widthCm * 10);
    const heightMm = Math.round(dto.heightCm * 10);
    const places = dto.places ?? 1;
    const declaredValueRub = Math.round(Number(dto.declaredValueRub));
    const cargoDescription = dto.cargoDescription.trim();
    const tmsContactOverride = {
      shipperName: dto.shipperName.trim(),
      shipperPhone: dto.shipperPhone.trim(),
      recipientName: dto.recipientName.trim(),
      recipientPhone: dto.recipientPhone.trim(),
    };

    const tmsCargoOverride = {
      weightGrams,
      lengthMm,
      widthMm,
      heightMm,
      places,
      declaredValueRub,
      cargoDescription,
      pickupDate: dto.pickupDate?.trim() || null,
    };

    const productId = await this.getOrCreateTmsEstimateProduct(userId);
    const price = Math.max(declaredValueRub, 0);

    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          userId,
          marketplace: 'MANUAL',
          externalId: ext,
          status: OrderStatus.NEW,
          totalAmount: price,
          warehouseName: origin,
          deliveryAddressLabel: dest,
          salesSource: src.name,
          tmsCargoOverride,
          tmsContactOverride,
        },
      });
      await tx.orderItem.create({
        data: {
          orderId: o.id,
          productId,
          quantity: 1,
          price,
        },
      });
      return o;
    });

    return this.prisma.order.findUnique({
      where: { id: order.id },
      include: { items: { include: { product: true } } },
    });
  }

  private async getOrCreateTmsEstimateProduct(userId: string): Promise<string> {
    const article = '__TMS_ESTIMATE__';
    const found = await this.prisma.product.findFirst({
      where: { userId, article },
    });
    if (found) return found.id;
    const p = await this.prisma.product.create({
      data: {
        userId,
        title: 'TMS · груз для оценки',
        article,
        cost: 0,
        weight: 1000,
        length: 100,
        width: 100,
        height: 100,
      },
    });
    return p.id;
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
      throw new BadRequestException(`Не удалось связаться с Major Express: ${String(error)}`);
    });

    const text = await res.text();
    if (!res.ok) {
      throw new BadRequestException(
        `Major Express ответил HTTP ${res.status}. Проверьте логин и пароль личного кабинета.`,
      );
    }
    if (/<\s*(?:soap:)?Fault\b|<faultstring\b/i.test(text)) {
      const m = text.match(/<(?:\w+:)?faultstring[^>]*>([^<]*)</i);
      const detail = m?.[1]?.trim();
      throw new BadRequestException(
        detail
          ? `Major Express: ${detail}`
          : 'Major Express вернул ошибку SOAP. Проверьте логин и пароль.',
      );
    }
  }

  private async validateCdekCredentials(login: string, password: string): Promise<void> {
    const tokenUrl = new URL('/v2/oauth/token', process.env.CDEK_API_BASE ?? 'https://api.cdek.ru');
    tokenUrl.searchParams.set('grant_type', 'client_credentials');
    tokenUrl.searchParams.set('client_id', login);
    tokenUrl.searchParams.set('client_secret', password);
    const res = await fetch(tokenUrl.toString(), {
      method: 'POST',
      headers: { Accept: 'application/json' },
    }).catch((error) => {
      throw new BadRequestException(`Не удалось связаться с CDEK API: ${String(error)}`);
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof data.access_token !== 'string') {
      const detail = typeof data.error_description === 'string' ? data.error_description : null;
      throw new BadRequestException(
        detail ? `CDEK: ${detail}` : 'CDEK не принял client_id/client_secret. Проверьте ключи API.',
      );
    }
  }

  private async validateDellinCredentials(
    appKey: string | null,
    login: string,
    password: string,
  ): Promise<void> {
    const key = (appKey ?? '').trim();
    if (!key) {
      throw new BadRequestException('Для Деловых Линий отсутствует appKey.');
    }
    const base = (process.env.DELLIN_API_BASE ?? 'https://api.dellin.ru').replace(/\/+$/, '');
    const res = await fetch(`${base}/v2/public/kladr.json`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ appkey: key, q: 'Москва', limit: 1 }),
    }).catch((error) => {
      throw new BadRequestException(`Не удалось связаться с API Деловых Линий: ${String(error)}`);
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const cities =
      (Array.isArray(data.cities) ? data.cities : null) ??
      (Array.isArray((data.data as Record<string, unknown> | undefined)?.cities)
        ? ((data.data as Record<string, unknown>).cities as unknown[])
        : null);
    if (!res.ok || !cities || cities.length === 0) {
      throw new BadRequestException('Деловые Линии: appKey не прошёл проверку.');
    }
    if (!login.trim() || !password.trim()) {
      throw new BadRequestException('Для Деловых Линий отсутствуют login/password ЛК.');
    }
    const authRes = await fetch(`${base}/v3/auth/login.json`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ appkey: key, login, password }),
    }).catch((error) => {
      throw new BadRequestException(`Не удалось пройти авторизацию API Деловых Линий: ${String(error)}`);
    });
    const authData = (await authRes.json().catch(() => ({}))) as Record<string, unknown>;
    const sessionID =
      (typeof authData.sessionID === 'string' && authData.sessionID) ||
      (typeof authData.sessionId === 'string' && authData.sessionId) ||
      (typeof (authData.data as Record<string, unknown> | undefined)?.sessionID === 'string' &&
        ((authData.data as Record<string, unknown>).sessionID as string)) ||
      (typeof (authData.data as Record<string, unknown> | undefined)?.sessionId === 'string' &&
        ((authData.data as Record<string, unknown>).sessionId as string)) ||
      '';
    if (!authRes.ok || !sessionID) {
      const details =
        (Array.isArray(authData.errors) ? authData.errors.join('; ') : null) ||
        (typeof authData.errors === 'string' ? authData.errors : null) ||
        (typeof authData.error === 'string' ? authData.error : null);
      throw new BadRequestException(
        details
          ? `Деловые Линии: ошибка авторизации (${details}).`
          : 'Деловые Линии: login/password не прошли проверку.',
      );
    }
  }

  private async validateDalliCredentials(tokenLike: string | null | undefined): Promise<void> {
    const token = (tokenLike ?? '').trim();
    if (!token) {
      throw new BadRequestException('Для Dalli-Service укажите API token (в поле appKey или login).');
    }
    const base = (process.env.DALLI_API_BASE ?? 'https://api.dalli-service.com/v1').replace(/\/+$/, '');
    const payload = `<?xml version="1.0" encoding="UTF-8"?>
<services>
  <auth token="${token.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')}"/>
</services>`;
    const res = await fetch(`${base}/`, {
      method: 'POST',
      headers: {
        Accept: 'application/xml, text/xml;q=0.9, */*;q=0.8',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: payload,
    }).catch((error) => {
      throw new BadRequestException(`Не удалось связаться с API Dalli-Service: ${String(error)}`);
    });
    const text = await res.text().catch(() => '');
    if (!res.ok || !/<services\b/i.test(text) || /error=/i.test(text)) {
      throw new BadRequestException('Dalli-Service: API token не прошел проверку.');
    }
  }

}
