# HandySeller TMS Partner API Quickstart

Этот документ описывает простой и надежный путь интеграции сайта/1С с HandySeller как с агрегатором доставки.
Цель интеграции:
- в корзине показать покупателю варианты доставки (цена, срок, перевозчик);
- после выбора варианта создать заказ у выбранного перевозчика через HandySeller;
- получить обратно `trackingNumber` и сохранить его у себя в заказе.

## 1) Модель интеграции

- Один API для всех партнеров: сайт, 1С, ERP/WMS.
- Один жизненный цикл:
  1. `estimate` - получить варианты доставки
  2. `create` - создать shipment-request
  3. `confirm` - подтвердить вариант и создать заказ у перевозчика
  4. `status/events` - получать статусы доставки
- Рекомендуемая схема статусов: webhook-first + pull fallback.

## 2) Получение доступа

1. В кабинете HandySeller создайте интеграционного клиента.
2. Получите `client_id` и `client_secret` (секрет показывается один раз).
3. Запросите OAuth token:

```bash
curl -X POST "https://api.handyseller.ru/api/tms/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type":"client_credentials",
    "client_id":"<CLIENT_ID>",
    "client_secret":"<CLIENT_SECRET>"
  }'
```

## 3) Checkout-flow (как на странице корзины)

Ниже правильный поток для фронта и бэкенда клиента:

1. Когда корзина и адрес заполнены -> вызываете `estimate`.
2. Из ответа `estimate` берете массив `options` и показываете его в блоке "Способ доставки".
3. Если выбран тариф до ПВЗ/терминала, сначала запрашиваете список точек и сохраняете выбранный `pickupPointId`.
4. Пользователь выбирает один вариант -> отправляете `select` с выбранным `quoteId` (и `pickupPointId` для ПВЗ-тарифов).
5. Пользователь нажимает "Оформить заказ" -> вызываете `confirm`.
6. Из ответа `confirm` берете `trackingNumber` и сохраняете в заказе клиента.

Если нужно, статусы дальше получаете через webhook и/или pull-методы.

## 4) Минимальный рабочий flow (запросы)

### 4.1 Рассчитать варианты доставки

```bash
curl -X POST "https://api.handyseller.ru/api/tms/v1/shipments/estimate" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Idempotency-Key: estimate-ord-1001-v1" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot": {
      "sourceSystem": "HANDYSELLER_CORE",
      "userId": "u_1",
      "coreOrderId": "ord_1001",
      "coreOrderNumber": "1001",
      "marketplace": "OWN_SITE",
      "createdAt": "2026-01-01T10:00:00.000Z",
      "originLabel": "Москва, Склад 1",
      "destinationLabel": "Казань, ул. Пример 1",
      "cargo": {
        "weightGrams": 1500,
        "widthMm": 200,
        "lengthMm": 300,
        "heightMm": 150,
        "places": 1,
        "declaredValueRub": 10000
      },
      "itemSummary": [{"productId":"p1","title":"Товар","quantity":1,"weightGrams":1500}]
    },
    "draft": {
      "originLabel":"Москва, Склад 1",
      "destinationLabel":"Казань, ул. Пример 1",
      "serviceFlags":["EXPRESS"]
    },
    "integration": {
      "externalOrderId": "1C-ORDER-1001",
      "orderType": "CLIENT_ORDER"
    }
  }'
```

### 4.2 Что вернется в `estimate` и что показывать в корзине

В ответе `estimate` вам важны поля:
- `shipmentRequestId` - id заявки в HandySeller (сохраните у себя).
- `options[]` - список вариантов доставки для отображения клиенту.
  - `options[].quoteId` - технический id варианта (нужен для `select`).
  - `options[].carrierName` - название перевозчика (показ в UI).
  - `options[].priceRub` - цена доставки (показ в UI).
  - `options[].etaDays` - срок доставки в днях (показ в UI).
  - `options[].notes` - пояснение к тарифу (опционально показывать).

Пример (сокращенно):

```json
{
  "shipmentRequestId": "req_01J...",
  "options": [
    {
      "quoteId": "q_01J..._dellin",
      "carrierId": "dellin",
      "carrierName": "Деловые Линии",
      "priceRub": 610,
      "etaDays": 2,
      "notes": "Экспресс, дверь -> дверь"
    },
    {
      "quoteId": "q_01J..._cdek",
      "carrierId": "cdek",
      "carrierName": "CDEK",
      "priceRub": 650,
      "etaDays": 3
    }
  ]
}
```

### 4.3 Создать shipment-request

`POST /api/tms/v1/shipments` с тем же payload (если нужен отдельный этап).

### 4.3a Получить ПВЗ/терминалы (для тарифов до ПВЗ)

Если в `estimate` пользователь выбрал вариант с доставкой в ПВЗ/терминал:
- вызовите `GET /api/tms/v1/shipments/{requestId}/pickup-points`;
- отобразите `id/code`, `address`, `lat/lon`, график работы;
- передайте выбранный `pickupPointId` в `select`/`confirm`.

### 4.4 Подтвердить выбранный вариант

1. Выберите `quoteId`.
2. Установите выбранный тариф:
   - `POST /api/tms/v1/shipments/{requestId}/select` с `{ "quoteId": "...", "pickupPointId": "..." }` для тарифов до ПВЗ;
   - для дверь-дверь/склад-дверь достаточно `{ "quoteId": "..." }`.
3. Подтвердите:

```bash
curl -X POST "https://api.handyseller.ru/api/tms/v1/shipments/<REQUEST_ID>/confirm" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Idempotency-Key: confirm-ord-1001-v1"
```

В ответе будет `trackingNumber`.

Важно:
- для тарифов до ПВЗ/терминала (`door->PVZ`, `warehouse->PVZ`) `pickupPointId` обязателен;
- `pickupPointId` нужно брать из нашего списка `pickup-points`, а не генерировать вручную.

### 4.5 Что вернется в `confirm` и что сохранить у себя

Из ответа `confirm` обязательно сохраните:
- `id` - внутренний `shipmentId` (для дальнейших запросов статусов);
- `trackingNumber` - трек-номер, который нужно вернуть в карточку заказа;
- `carrierName` - перевозчик (для отображения);
- `status` - текущий статус после бронирования.

Пример (сокращенно):

```json
{
  "id": "shp_01J...",
  "requestId": "req_01J...",
  "carrierId": "dellin",
  "carrierName": "Деловые Линии",
  "trackingNumber": "DELLIN-REQ-123456789",
  "status": "CONFIRMED"
}
```

## 5) Получение статусов

- По внутреннему id:
  - `GET /api/tms/v1/shipments/{shipmentId}`
  - `GET /api/tms/v1/shipments/{shipmentId}/events`
- По внешнему id заказа партнера:
  - `GET /api/tms/v1/shipments/by-external/{externalOrderId}?orderType=CLIENT_ORDER`
- Батч-синхронизация (рекомендуется для 1С):
  - `GET /api/tms/v1/shipments?updatedSince=<ISO>&limit=50&cursor=<CURSOR>`

## 6) Webhook-подписки

- Создать подписку:
  - `POST /api/tms/v1/webhooks/subscriptions` с `{ "callbackUrl": "https://partner.example.com/tms/events" }`
- Получить список:
  - `GET /api/tms/v1/webhooks/subscriptions`
- Удалить:
  - `DELETE /api/tms/v1/webhooks/subscriptions/{id}`
- Ротировать секрет подписи:
  - `POST /api/tms/v1/webhooks/subscriptions/{id}/rotate-secret`
- Replay события из delivery log:
  - `POST /api/tms/v1/webhooks/subscriptions/{id}/replay/{eventId}`

`callbackUrl` должен быть HTTPS.

### Формат webhook-события

HandySeller отправляет `POST` с JSON:

```json
{
  "id": "ev_...",
  "type": "shipment.confirmed",
  "occurredAt": "2026-04-22T12:00:00.000Z",
  "updatedAt": "2026-04-22T12:00:00.000Z",
  "data": {
    "shipmentId": "shp_...",
    "requestId": "req_...",
    "status": "CONFIRMED"
  }
}
```

Заголовки:
- `X-Handyseller-Event`: тип события
- `X-Handyseller-Signature`: `sha256=<hex_hmac>` по raw body (ключ - `signingSecret`)

Сейчас отправляются события:
- `shipment.confirmed`
- `shipment.updated`

### Проверка подписи (Node.js пример)

```js
import crypto from "crypto";

export function verifyHsWebhook(rawBody, signatureHeader, signingSecret) {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", signingSecret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
```

### Проверка подписи (1С, псевдо-поток)

1. Получить raw body запроса как строку UTF-8.  
2. Вычислить `HMAC-SHA256(rawBody, signingSecret)` в hex.  
3. Сравнить с `X-Handyseller-Signature` без префикса `sha256=`.  
4. Только после успешной проверки запускать бизнес-обработку статуса.

## 7) Какие поля обязательно отправлять в estimate/create

Минимум, без которого расчет/подтверждение обычно ломается:
- `snapshot.userId`
- `snapshot.originLabel`, `snapshot.destinationLabel`
- `snapshot.cargo.weightGrams` (+ желательно габариты)
- `snapshot.itemSummary[0].title`
- `snapshot.contacts.shipper.name`, `snapshot.contacts.shipper.phone`
- `snapshot.contacts.recipient.name`, `snapshot.contacts.recipient.phone`
- `draft.originLabel`, `draft.destinationLabel`
- `integration.externalOrderId`, `integration.orderType`

Телефоны передавайте в формате РФ, который легко нормализуется до `7XXXXXXXXXX`.

## 8) Правила надежности (обязательные)

- Всегда передавайте `Idempotency-Key` в write-запросах.
- Делайте retry только для сетевых/5xx ошибок с exponential backoff.
- Храните связь `externalOrderId <-> requestId/shipmentId`.
- При обработке webhook:
  - быстро отдавайте `2xx`,
  - тяжелую обработку делайте асинхронно.
- Проверяйте `X-Handyseller-Signature` перед бизнес-обработкой.
- Используйте pull как fallback, даже если включены webhook.

## 9) OpenAPI

- Спецификация: `GET /api/tms/openapi.yaml`
- В спецификации перечислены OAuth и v1 partner endpoints.

## 10) Готовые материалы для быстрого старта

- E2E script для **локального** ручного прогона (в GitHub CI не вызывается):
  - `scripts/tms-partner-e2e.sh`
- Postman collection:
  - `docs/TMS-Partner-API.postman_collection.json`
- Подробный справочник полей и типичных ошибок:
  - `docs/TMS-PARTNER-API-FIELD-GUIDE.md`

## 11) Lonmadi troubleshooting: `status=DRAFT` и `options=[]`

Если в ответе `estimate` вы видите:
- `status: "DRAFT"`
- `options: []`

это почти всегда не проблема бизнес-логики расчета, а вопрос контекста запроса.

Проверьте по порядку:
- тот ли контур: запрос должен идти в `https://api.handyseller.ru/api`;
- тот ли OAuth-клиент: токен должен быть выпущен именно для prod-клиента Лонмади;
- активны ли перевозчики для этого клиента (`GET /api/tms/carriers` с тем же токеном);
- действительно ли подставились переменные (`userId`, `externalOrderId`, `orderType`, адреса), а не шаблонные строки;
- если после `estimate` заявка осталась `DRAFT`, вызовите `POST /api/tms/shipment-requests/{requestId}/quotes/refresh`.

### 11.1 Референсный запрос `estimate` (рабочий в production)

```bash
curl -X POST "https://api.handyseller.ru/api/tms/v1/shipments/estimate" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Idempotency-Key: estimate-lonmadi-debug-1" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot": {
      "sourceSystem": "HANDYSELLER_CORE",
      "userId": "lonmadi_test",
      "coreOrderId": "ord_debug_1",
      "coreOrderNumber": "debug_1",
      "marketplace": "OWN_SITE",
      "createdAt": "2026-01-01T10:00:00.000Z",
      "originLabel": "Московская обл, г Химки, деревня Елино, тер Промышленная зона, стр 1",
      "destinationLabel": "Московская обл, г Солнечногорск",
      "cargo": {
        "weightGrams": 1500,
        "widthMm": 200,
        "lengthMm": 300,
        "heightMm": 150,
        "places": 1,
        "declaredValueRub": 10000
      },
      "itemSummary": [{"productId":"p1","title":"Товар","quantity":1,"weightGrams":1500}]
    },
    "draft": {
      "originLabel":"Московская обл, г Химки, деревня Елино, тер Промышленная зона, стр 1",
      "destinationLabel":"Московская обл, г Солнечногорск",
      "serviceFlags":["CONSOLIDATED"]
    },
    "integration": {
      "externalOrderId": "debug-ext-1",
      "orderType": "CLIENT_ORDER"
    }
  }'
```

Ожидаемый результат: `status=QUOTED` и ненулевой `options[]`.

### 11.2 Что прислать в поддержку HandySeller, если не работает

Чтобы быстро локализовать причину, передайте:
- полный raw response `estimate`;
- заголовок `X-Request-Id` запроса;
- `API_BASE_URL`, куда отправлялся запрос;
- ответ `GET /api/tms/carriers` с тем же токеном;
- (если был) ответ `quotes/refresh`.
