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
    return TMS_LONMADI_OPENAPI_YAML;
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

const TMS_LONMADI_OPENAPI_YAML = String.raw`openapi: 3.0.3
info:
  title: HandySeller TMS Partner API
  version: 1.0.0
  description: |
    Это документация для сайта, интернет-магазина или 1С, которые хотят подключиться к HandySeller как к агрегатору доставки.

    Если сказать совсем просто:
    1. Вы получаете client_id и client_secret в HandySeller.
    2. Меняете их на access_token через OAuth.
    3. Передаете нам корзину и адрес покупателя.
    4. Мы возвращаем варианты доставки: перевозчик, цена, срок, quoteId.
    5. Покупатель выбирает вариант доставки на вашем сайте.
    6. Вы отправляете нам выбранный quoteId.
    7. После подтверждения заказа вы вызываете confirm.
    8. Мы создаем реальную заявку у выбранного перевозчика и возвращаем trackingNumber.

    Главное правило для разработчика:
    - shipmentRequestId храните у себя вместе с заказом.
    - quoteId храните после выбора покупателем доставки.
    - trackingNumber сохраните после confirm и покажите клиенту/менеджеру.
    - Idempotency-Key передавайте на estimate и confirm, чтобы повтор запроса не создал дубль.

    Боевой проверенный сценарий:
    - CDEK создает реальную заявку и возвращает трек.
    - Major Express создает реальную заявку и возвращает трек.
    - Деловые Линии создают реальную заявку и возвращают трек вида DELLIN-REQ-62267026.

servers:
  - url: https://api.handyseller.ru/api
    description: Production API
  - url: https://app.handyseller.ru/api
    description: Web BFF для тестовой корзины HandySeller
  - url: http://localhost:4000/api
    description: Local development

tags:
  - name: 1. Auth
    description: Получение токена доступа.
  - name: 2. Checkout
    description: Методы для корзины сайта: рассчитать, выбрать, подтвердить.
  - name: 3. Status
    description: Получение созданной отгрузки, трека и событий.

paths:
  /tms/oauth/token:
    post:
      tags: [1. Auth]
      summary: 1. Получить access_token
      description: |
        Этот метод вызывается сервером клиента, не браузером.
        client_secret нельзя отдавать на фронт.

        access_token потом передается во все остальные методы в заголовке:
        Authorization: Bearer <access_token>
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/OAuthTokenRequest'
            example:
              grant_type: client_credentials
              client_id: 11111111-1111-1111-1111-111111111111
              client_secret: CLIENT_SECRET_FROM_HANDYSELLER
      responses:
        '200':
          description: Токен выдан. Используйте access_token в Authorization header.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OAuthTokenResponse'
              example:
                access_token: ACCESS_TOKEN_FROM_OAUTH_RESPONSE
                token_type: Bearer
                expires_in: 3600
                scope: tms:read tms:write
        '401':
          description: Неверный client_id или client_secret.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /tms/v1/shipments/estimate:
    post:
      tags: [2. Checkout]
      summary: 2. Рассчитать варианты доставки для корзины
      description: |
        Вызывайте этот метод, когда покупатель открыл корзину или ввел адрес доставки.

        Что отправить:
        - номер заказа в вашей системе;
        - адрес отправителя;
        - адрес получателя;
        - вес и габариты корзины;
        - контакты отправителя и получателя;
        - список товаров, хотя бы названия и количество.

        Что вернется:
        - shipmentRequestId: ID расчета. Его нужно сохранить у себя.
        - options: варианты доставки. Их нужно показать покупателю на сайте.

        Для UI обычно достаточно показать:
        carrierName + notes + priceRub + etaDays.
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateShipmentRequestInput'
            example:
              snapshot:
                sourceSystem: LONMADI_SITE
                coreOrderId: lonmadi-order-1001
                coreOrderNumber: "1001"
                marketplace: OWN_SITE
                createdAt: "2026-04-24T14:00:00.000Z"
                originLabel: Москва, склад Лонмади
                destinationLabel: Казань, ул. Пример 1
                cargo:
                  weightGrams: 1500
                  widthMm: 200
                  lengthMm: 300
                  heightMm: 150
                  places: 1
                  declaredValueRub: 6070
                itemSummary:
                  - productId: demo-rc-car
                    title: Радиоуправляемая машинка
                    quantity: 1
                    priceRub: 6070
                    weightGrams: 1500
                contacts:
                  shipper:
                    name: Склад Лонмади
                    phone: "+79990001122"
                  recipient:
                    name: Иван Петров
                    phone: "+79990003344"
              draft:
                originLabel: Москва, склад Лонмади
                destinationLabel: Казань, ул. Пример 1
                serviceFlags: [EXPRESS]
                pickupDate: "2026-04-27"
                pickupTimeStart: "09:00"
                pickupTimeEnd: "18:00"
              integration:
                externalOrderId: LONMADI-ORDER-1001
                orderType: CLIENT_ORDER
      responses:
        '200':
          description: Варианты доставки рассчитаны. Покажите options покупателю.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/EstimateResponse'
              example:
                shipmentRequestId: req_1777066854894_wfovj3
                status: QUOTED
                externalOrderId: LONMADI-ORDER-1001
                orderType: CLIENT_ORDER
                options:
                  - quoteId: req_1777066854894_wfovj3:dellin:terminal-terminal
                    carrierId: dellin
                    carrierName: Деловые Линии
                    mode: ROAD
                    serviceFlags: [EXPRESS]
                    etaDays: 2
                    priceRub: 610
                    totalPriceRub: 610
                    notes: Доставка Деловые Линии
                    priceDetails:
                      currency: RUB
                  - quoteId: req_1777066854894_wfovj3:cdek:door-door
                    carrierId: cdek
                    carrierName: CDEK
                    mode: ROAD
                    serviceFlags: [EXPRESS]
                    etaDays: 3
                    priceRub: 650
                    totalPriceRub: 650
                    notes: Доставка CDEK
        '400':
          description: В запросе не хватает обязательных данных или адрес/груз некорректен.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /tms/v1/shipments/{shipmentRequestId}/select:
    post:
      tags: [2. Checkout]
      summary: 3. Сохранить вариант доставки, выбранный покупателем
      description: |
        Вызывайте этот метод после того, как покупатель выбрал способ доставки в корзине.

        В path передайте shipmentRequestId из estimate.
        В body передайте quoteId выбранного варианта из options.

        Этот метод еще не создает заявку у перевозчика.
        Он только фиксирует выбор покупателя.
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/ShipmentRequestId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SelectQuoteRequest'
            example:
              quoteId: req_1777066854894_wfovj3:dellin:terminal-terminal
      responses:
        '200':
          description: Вариант доставки сохранен.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SelectQuoteResponse'
              example:
                id: req_1777066854894_wfovj3
                selectedQuoteId: req_1777066854894_wfovj3:dellin:terminal-terminal
                status: QUOTED
        '400':
          description: quoteId не найден или не принадлежит этому shipmentRequestId.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /tms/v1/shipments/{shipmentRequestId}/confirm:
    post:
      tags: [2. Checkout]
      summary: 4. Подтвердить заказ и создать реальную заявку у перевозчика
      description: |
        Вызывайте этот метод только после того, как:
        - покупатель выбрал доставку;
        - заказ на сайте действительно оформлен;
        - вы готовы создать реальную заявку у перевозчика.

        Важно:
        - confirm может создать реальную заявку у CDEK, Major Express или Деловых Линий.
        - используйте Idempotency-Key, чтобы повторный запрос не создал дубль.
        - в успешном ответе сохраните trackingNumber и carrierOrderReference.

        Что вернуть/сохранить в заказе клиента:
        - trackingNumber: трек-номер для покупателя и менеджера;
        - carrierName: название перевозчика;
        - carrierOrderReference: номер заявки у перевозчика;
        - shipmentId: внутренний ID HandySeller для статусов и документов.
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/ShipmentRequestId'
        - $ref: '#/components/parameters/IdempotencyKey'
      responses:
        '200':
          description: Заявка создана у перевозчика. Сохраните trackingNumber.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ConfirmResponse'
              example:
                id: shp_1777066880163_8oe5ez
                requestId: req_1777066854894_wfovj3
                carrierId: dellin
                carrierName: Деловые Линии
                trackingNumber: DELLIN-REQ-62267026
                carrierOrderReference: "62267026"
                status: CONFIRMED
                documents:
                  - type: WAYBILL
                    title: Накладная Деловых Линий (PDF)
        '400':
          description: Нельзя подтвердить заказ. Частые причины: не выбран quoteId, перевозчик отклонил данные, нет обязательных контактов или габаритов.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /tms/v1/shipments/{shipmentId}:
    get:
      tags: [3. Status]
      summary: Получить созданную отгрузку
      description: |
        Используйте после confirm, если нужно повторно получить trackingNumber, carrierOrderReference или текущий статус.
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/ShipmentId'
      responses:
        '200':
          description: Данные отгрузки.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ConfirmResponse'

  /tms/v1/shipments/{shipmentId}/events:
    get:
      tags: [3. Status]
      summary: Получить историю tracking-событий
      description: |
        Используйте для отображения истории доставки. Если событий еще нет, вернется пустой массив.
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/ShipmentId'
      responses:
        '200':
          description: Массив tracking-событий.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TrackingEventsResponse'

  /tms/v1/shipments/by-external/{externalOrderId}:
    get:
      tags: [3. Status]
      summary: Найти отгрузку по номеру заказа клиента
      description: |
        Удобно для 1С или сайта: если вы знаете свой externalOrderId, можно найти связанную отгрузку в HandySeller.
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: externalOrderId
          required: true
          schema:
            type: string
          description: Номер заказа в системе клиента. Это значение вы передавали в integration.externalOrderId.
          example: LONMADI-ORDER-1001
        - in: query
          name: orderType
          required: false
          schema:
            type: string
            enum: [CLIENT_ORDER, INTERNAL_TRANSFER, SUPPLIER_PICKUP]
          description: Если не знаете, передавайте CLIENT_ORDER или не передавайте параметр.
      responses:
        '200':
          description: Найденная связка заказа и отгрузки.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ShipmentByExternalResponse'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  parameters:
    IdempotencyKey:
      in: header
      name: Idempotency-Key
      required: false
      schema:
        type: string
      description: |
        Уникальный ключ операции. Передавайте один и тот же ключ при повторе одного и того же запроса.
        Пример для estimate: estimate-LONMADI-ORDER-1001.
        Пример для confirm: confirm-LONMADI-ORDER-1001.
      example: confirm-LONMADI-ORDER-1001
    ShipmentRequestId:
      in: path
      name: shipmentRequestId
      required: true
      schema:
        type: string
      description: ID расчета доставки из ответа estimate.
      example: req_1777066854894_wfovj3
    ShipmentId:
      in: path
      name: shipmentId
      required: true
      schema:
        type: string
      description: ID отгрузки из ответа confirm.
      example: shp_1777066880163_8oe5ez

  schemas:
    OAuthTokenRequest:
      type: object
      required: [grant_type, client_id, client_secret]
      properties:
        grant_type:
          type: string
          enum: [client_credentials]
          description: Всегда client_credentials.
        client_id:
          type: string
          format: uuid
          description: ID интеграции из HandySeller.
        client_secret:
          type: string
          description: Секрет интеграции. Храните только на сервере.

    OAuthTokenResponse:
      type: object
      required: [access_token, token_type, expires_in]
      properties:
        access_token:
          type: string
          description: JWT токен для вызова TMS API.
        token_type:
          type: string
          example: Bearer
        expires_in:
          type: integer
          description: Через сколько секунд токен истечет.
          example: 3600
        scope:
          type: string
          example: tms:read tms:write

    CreateShipmentRequestInput:
      type: object
      required: [snapshot, draft, integration]
      description: |
        Это главный объект для расчета доставки. Думайте о нем как о снимке корзины и адресов.
        Все значения должны быть фактическими на момент расчета.
      properties:
        snapshot:
          $ref: '#/components/schemas/ShipmentSnapshot'
        draft:
          $ref: '#/components/schemas/ShipmentDraft'
        integration:
          $ref: '#/components/schemas/IntegrationMeta'

    ShipmentSnapshot:
      type: object
      required: [coreOrderId, coreOrderNumber, originLabel, destinationLabel, cargo, itemSummary, contacts]
      properties:
        sourceSystem:
          type: string
          description: Откуда пришел заказ. Например сайт Лонмади или 1С.
          example: LONMADI_SITE
        coreOrderId:
          type: string
          description: Технический ID заказа в вашей системе.
          example: lonmadi-order-1001
        coreOrderNumber:
          type: string
          description: Номер заказа, который видит менеджер или покупатель.
          example: "1001"
        marketplace:
          type: string
          description: Канал продажи.
          example: OWN_SITE
        createdAt:
          type: string
          format: date-time
          description: Когда создан заказ. Лучше передавать UTC ISO строку.
          example: "2026-04-24T14:00:00.000Z"
        originLabel:
          type: string
          description: Адрес или понятное название склада отправителя.
          example: Москва, склад Лонмади
        destinationLabel:
          type: string
          description: Адрес доставки покупателя.
          example: Казань, ул. Пример 1
        cargo:
          $ref: '#/components/schemas/CargoSnapshot'
        itemSummary:
          type: array
          minItems: 1
          description: Список товаров в корзине. Минимум одно название и количество.
          items:
            $ref: '#/components/schemas/ItemSummaryRow'
        contacts:
          $ref: '#/components/schemas/ShipmentContacts'

    CargoSnapshot:
      type: object
      required: [weightGrams]
      properties:
        weightGrams:
          type: number
          description: Общий вес корзины в граммах. 1.5 кг = 1500.
          example: 1500
        widthMm:
          type: number
          description: Ширина упаковки в миллиметрах.
          example: 200
        lengthMm:
          type: number
          description: Длина упаковки в миллиметрах.
          example: 300
        heightMm:
          type: number
          description: Высота упаковки в миллиметрах.
          example: 150
        places:
          type: integer
          description: Количество грузовых мест. Если одна коробка, передайте 1.
          example: 1
        declaredValueRub:
          type: number
          description: Объявленная стоимость заказа в рублях.
          example: 6070

    ItemSummaryRow:
      type: object
      required: [title, quantity]
      properties:
        productId:
          type: string
          description: ID товара в системе клиента.
          example: demo-rc-car
        title:
          type: string
          description: Название товара. Перевозчики могут видеть это как описание груза.
          example: Радиоуправляемая машинка
        quantity:
          type: integer
          description: Количество штук.
          example: 1
        priceRub:
          type: number
          description: Цена позиции в рублях.
          example: 6070
        weightGrams:
          type: number
          description: Вес позиции в граммах, если известен.
          example: 1500

    ShipmentContacts:
      type: object
      required: [shipper, recipient]
      properties:
        shipper:
          $ref: '#/components/schemas/ContactPerson'
        recipient:
          $ref: '#/components/schemas/ContactPerson'

    ContactPerson:
      type: object
      required: [name, phone]
      properties:
        name:
          type: string
          description: Имя человека или название склада/компании.
          example: Иван Петров
        phone:
          type: string
          description: Телефон в формате +7XXXXXXXXXX. Это важно для перевозчиков.
          example: "+79990003344"
        email:
          type: string
          format: email
          description: Email, если есть. Можно не передавать.
          example: buyer@example.com

    ShipmentDraft:
      type: object
      required: [originLabel, destinationLabel]
      properties:
        originLabel:
          type: string
          description: Откуда забирать груз. Обычно совпадает с snapshot.originLabel.
          example: Москва, склад Лонмади
        destinationLabel:
          type: string
          description: Куда доставлять груз. Обычно совпадает с snapshot.destinationLabel.
          example: Казань, ул. Пример 1
        serviceFlags:
          type: array
          description: Тип доставки. Для обычной быстрой доставки передавайте EXPRESS.
          items:
            type: string
            enum: [EXPRESS, CONSOLIDATED]
          example: [EXPRESS]
        pickupDate:
          type: string
          format: date
          description: Желаемая дата забора груза. Формат YYYY-MM-DD.
          example: "2026-04-27"
        pickupTimeStart:
          type: string
          description: Начало окна забора. Формат HH:mm.
          example: "09:00"
        pickupTimeEnd:
          type: string
          description: Конец окна забора. Формат HH:mm.
          example: "18:00"

    IntegrationMeta:
      type: object
      required: [externalOrderId, orderType]
      properties:
        externalOrderId:
          type: string
          description: Номер заказа в системе клиента. По нему потом можно найти доставку.
          example: LONMADI-ORDER-1001
        orderType:
          type: string
          enum: [CLIENT_ORDER, INTERNAL_TRANSFER, SUPPLIER_PICKUP]
          description: Для сайта и обычных заказов покупателя используйте CLIENT_ORDER.
          example: CLIENT_ORDER

    DeliveryOption:
      type: object
      required: [quoteId, carrierId, carrierName, priceRub]
      properties:
        quoteId:
          type: string
          description: ID варианта доставки. Передайте его в select, если покупатель выбрал этот вариант.
          example: req_1777066854894_wfovj3:dellin:terminal-terminal
        carrierId:
          type: string
          description: Код перевозчика.
          enum: [cdek, dellin, major-express]
          example: dellin
        carrierName:
          type: string
          description: Название перевозчика для показа покупателю.
          example: Деловые Линии
        mode:
          type: string
          description: Тип перевозки. Обычно ROAD.
          example: ROAD
        serviceFlags:
          type: array
          items:
            type: string
          description: Дополнительные признаки сервиса.
          example: [EXPRESS]
        etaDays:
          type: integer
          description: Примерный срок доставки в днях.
          example: 2
        priceRub:
          type: number
          description: Цена доставки в рублях. Это главное поле цены для корзины.
          example: 610
        totalPriceRub:
          type: number
          description: То же значение для совместимости. Можно использовать priceRub.
          example: 610
        notes:
          type: string
          nullable: true
          description: Текстовое пояснение для интерфейса.
          example: Доставка Деловые Линии
        priceDetails:
          type: object
          additionalProperties: true
          nullable: true
          description: Детализация цены, если перевозчик ее вернул.

    EstimateResponse:
      type: object
      required: [shipmentRequestId, options]
      properties:
        shipmentRequestId:
          type: string
          description: ID расчета. Сохраните его в заказе клиента.
          example: req_1777066854894_wfovj3
        status:
          type: string
          description: Статус расчета.
          example: QUOTED
        externalOrderId:
          type: string
          nullable: true
          description: Ваш номер заказа, который вы передали в integration.externalOrderId.
          example: LONMADI-ORDER-1001
        orderType:
          type: string
          nullable: true
          example: CLIENT_ORDER
        options:
          type: array
          description: Варианты доставки для показа покупателю.
          items:
            $ref: '#/components/schemas/DeliveryOption'

    SelectQuoteRequest:
      type: object
      required: [quoteId]
      properties:
        quoteId:
          type: string
          description: ID выбранного варианта доставки из options.
          example: req_1777066854894_wfovj3:dellin:terminal-terminal

    SelectQuoteResponse:
      type: object
      properties:
        id:
          type: string
          description: shipmentRequestId.
          example: req_1777066854894_wfovj3
        selectedQuoteId:
          type: string
          description: quoteId, который был выбран.
          example: req_1777066854894_wfovj3:dellin:terminal-terminal
        status:
          type: string
          example: QUOTED

    ConfirmResponse:
      type: object
      required: [id, requestId, carrierId, trackingNumber, status]
      properties:
        id:
          type: string
          description: ID отгрузки в HandySeller. Используйте для статусов, событий и документов.
          example: shp_1777066880163_8oe5ez
        requestId:
          type: string
          description: shipmentRequestId, по которому была создана отгрузка.
          example: req_1777066854894_wfovj3
        carrierId:
          type: string
          description: Код выбранного перевозчика.
          example: dellin
        carrierName:
          type: string
          description: Название выбранного перевозчика.
          example: Деловые Линии
        trackingNumber:
          type: string
          description: Трек-номер. Его нужно вернуть в заказ клиента.
          example: DELLIN-REQ-62267026
        carrierOrderReference:
          type: string
          nullable: true
          description: Номер заявки или заказа в системе перевозчика.
          example: "62267026"
        status:
          type: string
          description: CONFIRMED означает, что заявка создана у перевозчика.
          example: CONFIRMED
        documents:
          type: array
          nullable: true
          description: Документы перевозки, если уже доступны.
          items:
            type: object
            additionalProperties: true

    TrackingEventsResponse:
      type: array
      items:
        type: object
        properties:
          id:
            type: string
            example: evt_01
          status:
            type: string
            example: IN_TRANSIT
          occurredAt:
            type: string
            format: date-time
            example: "2026-04-25T10:00:00.000Z"
          description:
            type: string
            example: Груз принят перевозчиком

    ShipmentByExternalResponse:
      type: object
      properties:
        request:
          type: object
          additionalProperties: true
        shipment:
          type: object
          nullable: true
          additionalProperties: true

    ErrorResponse:
      type: object
      properties:
        message:
          type: string
          description: Человеческое описание ошибки.
          example: Dellin booking failed: missing receiver document
        error:
          type: string
          example: Bad Request
        statusCode:
          type: integer
          example: 400
`;

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
