import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateTmsM2mClientDto } from './dto/create-tms-m2m-client.dto';

const DEFAULT_SCOPES = ['tms:read', 'tms:write'] as const;

@Injectable()
export class TmsM2mService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private hashSecret(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  private generateClientSecret(): string {
    return `hs_tms_${randomBytes(32).toString('base64url')}`;
  }

  private parseScopes(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [...DEFAULT_SCOPES];
    return raw.filter((x): x is string => typeof x === 'string');
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.tmsM2mClient.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      publicId: r.publicId,
      label: r.label,
      scopes: this.parseScopes(r.scopes),
      revokedAt: r.revokedAt?.toISOString() ?? null,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createForUser(userId: string, dto: CreateTmsM2mClientDto) {
    const scopes = dto.scopes?.length ? [...new Set(dto.scopes)] : [...DEFAULT_SCOPES];
    const publicId = randomUUID();
    const clientSecret = this.generateClientSecret();
    const secretHash = this.hashSecret(clientSecret);

    const row = await this.prisma.tmsM2mClient.create({
      data: {
        userId,
        label: dto.label?.trim() || null,
        publicId,
        secretHash,
        scopes,
      },
    });

    return {
      id: row.id,
      client_id: row.publicId,
      client_secret: clientSecret,
      label: row.label,
      scopes: this.parseScopes(row.scopes),
      created_at: row.createdAt.toISOString(),
    };
  }

  async revoke(userId: string, id: string): Promise<void> {
    const row = await this.prisma.tmsM2mClient.findFirst({ where: { id, userId } });
    if (!row) {
      throw new BadRequestException('Интеграция не найдена');
    }
    await this.prisma.tmsM2mClient.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
  }

  async exchangeClientCredentials(clientId: string, clientSecret: string) {
    const trimmedSecret = clientSecret.trim();
    if (!clientId || !trimmedSecret) {
      throw new UnauthorizedException('Неверные учётные данные клиента');
    }

    const row = await this.prisma.tmsM2mClient.findUnique({
      where: { publicId: clientId },
    });
    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Неверные учётные данные клиента');
    }

    const expectedHash = this.hashSecret(trimmedSecret);
    if (expectedHash !== row.secretHash) {
      throw new UnauthorizedException('Неверные учётные данные клиента');
    }

    const scopes = this.parseScopes(row.scopes);
    const expiresIn = this.config.get<string>('TMS_M2M_TOKEN_EXPIRES_IN')?.trim() || '1h';
    const accessToken = this.jwtService.sign(
      {
        sub: row.userId,
        typ: 'tms_m2m',
        scope: scopes.join(' '),
        cid: row.publicId,
      },
      { expiresIn },
    );

    const expSec = this.jwtExpirySeconds(expiresIn);
    await this.prisma.tmsM2mClient.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expSec,
      scope: scopes.join(' '),
    };
  }

  /** Документация OpenAPI (без секретов). */
  getOpenApiYaml(): string {
    return TMS_EXTERNAL_OPENAPI_YAML;
  }

  private jwtExpirySeconds(expiresIn: string): number {
    const m = /^(\d+)([smhd])?$/i.exec(expiresIn.trim());
    if (!m) return 3600;
    const n = Number(m[1]);
    const u = (m[2] ?? 's').toLowerCase();
    const mult = u === 'd' ? 86400 : u === 'h' ? 3600 : u === 'm' ? 60 : 1;
    return Math.max(60, n * mult);
  }
}

const TMS_EXTERNAL_OPENAPI_YAML = String.raw`openapi: 3.0.3
info:
  title: HandySeller TMS External API
  version: 1.0.0
  description: |
    Единый API для сайта и 1С через OAuth2 **client_credentials**.
    Базовый URL совпадает с вашим API HandySeller (префикс \`/api\`).

    Поток:
    1. В личном кабинете создайте интеграцию (получите \`client_id\` и \`client_secret\` один раз).
    2. \`POST /api/tms/oauth/token\` — обмен на короткоживущий JWT.
    3. Используйте \`/api/tms/v1/...\` для интеграции партнера (оценка/создание/подтверждение/статусы).
    4. Для write-операций передавайте \`Idempotency-Key\`.

servers:
  - url: https://api.handyseller.ru/api
    description: Production
  - url: http://localhost:4000/api
    description: Local API

paths:
  /tms/oauth/token:
    post:
      summary: Получить access token (client_credentials)
      tags: [OAuth2]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [grant_type, client_id, client_secret]
              properties:
                grant_type:
                  type: string
                  enum: [client_credentials]
                client_id:
                  type: string
                  format: uuid
                client_secret:
                  type: string
      responses:
        '200':
          description: Токен выдан
          content:
            application/json:
              schema:
                type: object
                properties:
                  access_token: { type: string }
                  token_type: { type: string, example: Bearer }
                  expires_in: { type: integer }
                  scope: { type: string }
        '401':
          description: Неверный client_id / client_secret

  /tms/overview:
    get:
      summary: Сводка TMS
      tags: [TMS]
      security: [bearerAuth]
      responses:
        '200':
          description: OK

  /tms/v1/shipments/estimate:
    post:
      summary: Рассчитать варианты доставки
      description: |
        Используйте этот метод для блока "Способ доставки" в корзине.
        В ответе вернется shipmentRequestId и массив options для показа пользователю.
      tags: [TMS v1]
      security: [bearerAuth]
      parameters:
        - in: header
          name: Idempotency-Key
          schema: { type: string }
          required: false
          description: Рекомендуется для retry-safe поведения
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateShipmentRequestInput'
            examples:
              websiteCheckout:
                summary: Пример запроса из checkout сайта
                value:
                  snapshot:
                    sourceSystem: HANDYSELLER_CORE
                    userId: u_1
                    coreOrderId: ord_1001
                    coreOrderNumber: "1001"
                    marketplace: OWN_SITE
                    createdAt: "2026-04-24T14:00:00.000Z"
                    originLabel: Москва, Склад 1
                    destinationLabel: Казань, ул. Пример 1
                    cargo:
                      weightGrams: 1500
                      widthMm: 200
                      lengthMm: 300
                      heightMm: 150
                      places: 1
                      declaredValueRub: 10000
                    itemSummary:
                      - productId: p1
                        title: Товар
                        quantity: 1
                        weightGrams: 1500
                    contacts:
                      shipper:
                        name: Склад HandySeller
                        phone: "+79990001122"
                      recipient:
                        name: Тестовый получатель
                        phone: "+79990003344"
                  draft:
                    originLabel: Москва, Склад 1
                    destinationLabel: Казань, ул. Пример 1
                    serviceFlags: [EXPRESS]
                  integration:
                    externalOrderId: 1C-ORDER-1001
                    orderType: CLIENT_ORDER
      responses:
        '200':
          description: Варианты доставки рассчитаны
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/EstimateResponse'
              examples:
                estimatedOptions:
                  summary: Успешный ответ для отрисовки способов доставки
                  value:
                    shipmentRequestId: req_01JABCXYZ
                    options:
                      - quoteId: q_01JABCXYZ_dellin
                        carrierId: dellin
                        carrierName: Деловые Линии
                        mode: ROAD
                        priceRub: 610
                        etaDays: 2
                        notes: Экспресс, дверь -> дверь
                      - quoteId: q_01JABCXYZ_cdek
                        carrierId: cdek
                        carrierName: CDEK
                        mode: ROAD
                        priceRub: 650
                        etaDays: 3
        '400':
          description: Ошибка валидации входных данных
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /tms/v1/shipments:
    get:
      summary: Список отгрузок партнера (батч синхронизация)
      tags: [TMS v1]
      security: [bearerAuth]
      parameters:
        - in: query
          name: externalOrderId
          schema: { type: string }
        - in: query
          name: orderType
          schema:
            type: string
            enum: [CLIENT_ORDER, INTERNAL_TRANSFER, SUPPLIER_PICKUP]
        - in: query
          name: updatedSince
          schema: { type: string, format: date-time }
        - in: query
          name: limit
          schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
        - in: query
          name: cursor
          schema: { type: string }
      responses:
        '200':
          description: Пагинированный список
    post:
      summary: Создать shipment-request партнера
      tags: [TMS v1]
      security: [bearerAuth]
      parameters:
        - in: header
          name: Idempotency-Key
          schema: { type: string }
          required: false
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateShipmentRequestInput'
            examples:
              createFromOrder:
                summary: Пример создания shipment-request
                value:
                  snapshot:
                    sourceSystem: HANDYSELLER_CORE
                    userId: u_1
                    coreOrderId: ord_1001
                    coreOrderNumber: "1001"
                    marketplace: OWN_SITE
                    createdAt: "2026-04-24T14:00:00.000Z"
                    originLabel: Москва, Склад 1
                    destinationLabel: Казань, ул. Пример 1
                    cargo:
                      weightGrams: 1500
                      widthMm: 200
                      lengthMm: 300
                      heightMm: 150
                      places: 1
                      declaredValueRub: 10000
                    itemSummary:
                      - productId: p1
                        title: Товар
                        quantity: 1
                    contacts:
                      shipper:
                        name: Склад HandySeller
                        phone: "+79990001122"
                      recipient:
                        name: Тестовый получатель
                        phone: "+79990003344"
                  draft:
                    originLabel: Москва, Склад 1
                    destinationLabel: Казань, ул. Пример 1
                    serviceFlags: [EXPRESS]
                  integration:
                    externalOrderId: 1C-ORDER-1001
                    orderType: CLIENT_ORDER
      responses:
        '200':
          description: Заявка создана

  /tms/v1/shipments/{id}:
    get:
      summary: Получить shipment по внутреннему id
      tags: [TMS v1]
      security: [bearerAuth]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Shipment snapshot

  /tms/v1/shipments/{id}/confirm:
    post:
      summary: Подтвердить выбранный тариф и забронировать у перевозчика
      description: |
        Вызывается после того, как пользователь выбрал вариант доставки.
        Успешный ответ содержит trackingNumber, который нужно сохранить в заказе клиента.
      tags: [TMS v1]
      security: [bearerAuth]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
        - in: header
          name: Idempotency-Key
          schema: { type: string }
          required: false
      responses:
        '200':
          description: Shipment подтвержден, возвращается trackingNumber
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ConfirmResponse'
              examples:
                confirmedShipment:
                  summary: Успешное подтверждение заказа у перевозчика
                  value:
                    id: shp_01JABCXYZ
                    requestId: req_01JABCXYZ
                    carrierId: dellin
                    carrierName: Деловые Линии
                    trackingNumber: DELLIN-REQ-123456789
                    status: CONFIRMED
        '400':
          description: Ошибка подтверждения/бронирования
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /tms/v1/shipments/{id}/select:
    post:
      summary: Выбрать тариф по quoteId
      description: |
        Передайте quoteId, выбранный пользователем в корзине.
        После этого вариант доставки закрепляется за shipmentRequestId.
      tags: [TMS v1]
      security: [bearerAuth]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [quoteId]
              properties:
                quoteId: { type: string }
      responses:
        '200':
          description: Тариф выбран
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SelectQuoteResponse'
        '400':
          description: Некорректный quoteId или requestId
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /tms/v1/shipments/{id}/events:
    get:
      summary: Нормализованные tracking-события
      tags: [TMS v1]
      security: [bearerAuth]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Список событий

  /tms/v1/shipments/by-external/{externalOrderId}:
    get:
      summary: Найти shipment по внешнему номеру заказа партнера
      tags: [TMS v1]
      security: [bearerAuth]
      parameters:
        - in: path
          name: externalOrderId
          required: true
          schema: { type: string }
        - in: query
          name: orderType
          schema:
            type: string
            enum: [CLIENT_ORDER, INTERNAL_TRANSFER, SUPPLIER_PICKUP]
      responses:
        '200':
          description: Связка request/shipment по внешнему id

  /tms/v1/webhooks/subscriptions:
    get:
      summary: Список webhook-подписок партнера
      tags: [TMS v1]
      security: [bearerAuth]
      responses:
        '200':
          description: Список подписок
    post:
      summary: Создать webhook-подписку партнера
      tags: [TMS v1]
      security: [bearerAuth]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [callbackUrl]
              properties:
                callbackUrl:
                  type: string
                  format: uri
      responses:
        '200':
          description: Подписка создана

  /tms/v1/webhooks/subscriptions/{id}:
    delete:
      summary: Удалить webhook-подписку
      tags: [TMS v1]
      security: [bearerAuth]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Подписка удалена

  /tms/v1/webhooks/subscriptions/{id}/rotate-secret:
    post:
      summary: Ротация webhook signing secret
      tags: [TMS v1]
      security: [bearerAuth]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Новый signing secret выпущен

  /tms/v1/webhooks/subscriptions/{id}/replay/{eventId}:
    post:
      summary: Переотправить webhook-событие из delivery log
      tags: [TMS v1]
      security: [bearerAuth]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
        - in: path
          name: eventId
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Событие поставлено в очередь на повторную доставку

  /tms/client-orders:
    get:
      summary: Заказы клиентов (TMS)
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipment-requests:
    get:
      summary: Список заявок на перевозку
      tags: [TMS]
      security: [bearerAuth]
    post:
      summary: Создать заявку из заказа (scope tms:write)
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipment-requests/{id}/quotes:
    get:
      summary: Котировки по заявке
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipment-requests/{id}/quotes/refresh:
    post:
      summary: Обновить котировки (scope tms:write)
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipment-requests/{id}/select-quote:
    post:
      summary: Выбрать котировку (scope tms:write)
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipments:
    get:
      summary: Список перевозок
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipments/{id}/tracking:
    get:
      summary: Трекинг перевозки
      tags: [TMS]
      security: [bearerAuth]

  /tms/shipments/{id}/documents:
    get:
      summary: Документы перевозки
      tags: [TMS]
      security: [bearerAuth]

  /tms/carriers:
    get:
      summary: Справочник перевозчиков
      tags: [TMS]
      security: [bearerAuth]

  /tms/routing-policies:
    get:
      summary: Политики маршрутизации
      tags: [TMS]
      security: [bearerAuth]

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    ErrorResponse:
      type: object
      properties:
        message: { type: string, example: Invalid request payload }
        error: { type: string, example: Bad Request }
        statusCode: { type: integer, example: 400 }

    DeliveryOption:
      type: object
      properties:
        quoteId:
          type: string
          description: Идентификатор варианта доставки (передается в select)
          example: q_01JABCXYZ
        carrierId:
          type: string
          example: dellin
        carrierName:
          type: string
          example: Деловые Линии
        mode:
          type: string
          example: ROAD
        priceRub:
          type: number
          example: 610
        etaDays:
          type: integer
          example: 2
        notes:
          type: string
          nullable: true
          example: Экспресс, дверь -> дверь

    EstimateResponse:
      type: object
      properties:
        shipmentRequestId:
          type: string
          description: Сохраните это значение, оно нужно для select/confirm
          example: req_01JABCXYZ
        options:
          type: array
          items:
            $ref: '#/components/schemas/DeliveryOption'

    SelectQuoteResponse:
      type: object
      properties:
        id:
          type: string
          description: Shipment request id
          example: req_01JABCXYZ
        selectedQuoteId:
          type: string
          description: Выбранный quoteId
          example: q_01JABCXYZ
        status:
          type: string
          example: DRAFT

    ConfirmResponse:
      type: object
      properties:
        id:
          type: string
          description: Shipment id (храните для статусов/events)
          example: shp_01JABCXYZ
        requestId:
          type: string
          example: req_01JABCXYZ
        carrierId:
          type: string
          example: dellin
        carrierName:
          type: string
          example: Деловые Линии
        trackingNumber:
          type: string
          description: Трек-номер для возврата в систему клиента
          example: DELLIN-REQ-123456789
        status:
          type: string
          example: CONFIRMED

    CreateShipmentRequestInput:
      type: object
      required: [snapshot, draft]
      description: Запрос на расчет/создание доставки из корзины сайта или заказа 1С.
      properties:
        snapshot:
          $ref: '#/components/schemas/ShipmentSnapshot'
        draft:
          $ref: '#/components/schemas/ShipmentDraft'
        integration:
          $ref: '#/components/schemas/IntegrationMeta'

    ShipmentSnapshot:
      type: object
      required: [userId, originLabel, destinationLabel, cargo, itemSummary]
      description: |
        Снимок заказа на момент расчета доставки.
        Этот блок должен быть достаточным для расчета тарифов и последующего confirm.
      properties:
        sourceSystem:
          type: string
          description: Система-источник заказа (например, сайт/1С)
          example: HANDYSELLER_CORE
        userId:
          type: string
          description: Идентификатор клиента/магазина в вашей системе
          example: u_1
        coreOrderId:
          type: string
          description: Внутренний id заказа в вашей системе
          example: ord_1001
        coreOrderNumber:
          type: string
          description: Человекочитаемый номер заказа
          example: 1001
        marketplace:
          type: string
          description: Канал заказа (например OWN_SITE)
          example: OWN_SITE
        createdAt:
          type: string
          format: date-time
          description: Время создания заказа (UTC)
        originLabel:
          type: string
          description: Адрес/локация отправителя
          example: Москва, Склад 1
        destinationLabel:
          type: string
          description: Адрес/локация получателя
          example: Казань, ул. Пример 1
        cargo:
          $ref: '#/components/schemas/CargoSnapshot'
        itemSummary:
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/ItemSummaryRow'
        contacts:
          $ref: '#/components/schemas/ShipmentContacts'

    CargoSnapshot:
      type: object
      required: [weightGrams]
      description: Параметры грузоместа/груза для расчета доставки.
      properties:
        weightGrams:
          type: number
          description: Вес в граммах
          example: 1500
        widthMm:
          type: number
          description: Ширина в мм
          example: 200
        lengthMm:
          type: number
          description: Длина в мм
          example: 300
        heightMm:
          type: number
          description: Высота в мм
          example: 150
        places:
          type: integer
          description: Количество мест
          example: 1
        declaredValueRub:
          type: number
          description: Объявленная стоимость в рублях
          example: 10000

    ItemSummaryRow:
      type: object
      required: [title, quantity]
      properties:
        productId:
          type: string
          description: Внутренний id товара
          example: p1
        title:
          type: string
          description: Название товара/груза (используется перевозчиками)
          example: Товар
        quantity:
          type: integer
          example: 1
        weightGrams:
          type: number
          description: Вес позиции в граммах (если известен)
          example: 1500

    ShipmentContacts:
      type: object
      properties:
        shipper:
          $ref: '#/components/schemas/ContactPerson'
        recipient:
          $ref: '#/components/schemas/ContactPerson'

    ContactPerson:
      type: object
      properties:
        name:
          type: string
          description: Имя/название контакта
          example: Тестовый получатель
        phone:
          type: string
          description: Телефон контакта (рекомендуется формат +7XXXXXXXXXX)
          example: +79990003344
        email:
          type: string
          format: email
          description: Email контакта (опционально)
          example: user@example.com

    ShipmentDraft:
      type: object
      required: [originLabel, destinationLabel]
      description: Черновик маршрута и сервисных параметров доставки.
      properties:
        originLabel:
          type: string
          description: Откуда забирать груз (может отличаться от snapshot.originLabel)
          example: Москва, Склад 1
        destinationLabel:
          type: string
          description: Куда доставлять груз (может отличаться от snapshot.destinationLabel)
          example: Казань, ул. Пример 1
        serviceFlags:
          type: array
          description: Флаги сервиса доставки
          items:
            type: string
            enum: [EXPRESS, CONSOLIDATED]
          example: [EXPRESS]
        pickupDate:
          type: string
          format: date
          description: Желаемая дата забора (YYYY-MM-DD)
          example: 2026-04-27
        pickupTimeStart:
          type: string
          description: Начало окна забора (HH:mm)
          example: 09:00
        pickupTimeEnd:
          type: string
          description: Конец окна забора (HH:mm)
          example: 18:00

    IntegrationMeta:
      type: object
      description: Поля для связи сущностей между системой клиента и HandySeller.
      properties:
        externalOrderId:
          type: string
          description: Внешний id заказа в системе клиента (ключ для lookup)
          example: 1C-ORDER-1001
        orderType:
          type: string
          enum: [CLIENT_ORDER, INTERNAL_TRANSFER, SUPPLIER_PICKUP]
          description: Тип заказа в системе клиента
          example: CLIENT_ORDER
`;
