# HandySeller TMS Partner API Quickstart

Этот документ описывает самый простой и надежный способ подключения сайта или 1С к TMS API.

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

## 3) Минимальный рабочий flow

### 3.1 Рассчитать варианты доставки

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

### 3.2 Создать shipment-request

`POST /api/tms/v1/shipments` с тем же payload (если нужен отдельный этап).

### 3.3 Подтвердить выбранный вариант

1. Выберите `quoteId`.
2. Установите выбранный тариф:
   - `POST /api/tms/v1/shipments/{requestId}/select` с `{ "quoteId": "..." }`
3. Подтвердите:

```bash
curl -X POST "https://api.handyseller.ru/api/tms/v1/shipments/<REQUEST_ID>/confirm" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Idempotency-Key: confirm-ord-1001-v1"
```

В ответе будет `trackingNumber`.

## 4) Получение статусов

- По внутреннему id:
  - `GET /api/tms/v1/shipments/{shipmentId}`
  - `GET /api/tms/v1/shipments/{shipmentId}/events`
- По внешнему id заказа партнера:
  - `GET /api/tms/v1/shipments/by-external/{externalOrderId}?orderType=CLIENT_ORDER`
- Батч-синхронизация (рекомендуется для 1С):
  - `GET /api/tms/v1/shipments?updatedSince=<ISO>&limit=50&cursor=<CURSOR>`

## 5) Webhook-подписки

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

## 6) Правила надежности (обязательные)

- Всегда передавайте `Idempotency-Key` в write-запросах.
- Делайте retry только для сетевых/5xx ошибок с exponential backoff.
- Храните связь `externalOrderId <-> requestId/shipmentId`.
- При обработке webhook:
  - быстро отдавайте `2xx`,
  - тяжелую обработку делайте асинхронно.
- Проверяйте `X-Handyseller-Signature` перед бизнес-обработкой.
- Используйте pull как fallback, даже если включены webhook.

## 7) OpenAPI

- Спецификация: `GET /api/tms/openapi.yaml`
- В спецификации перечислены OAuth и v1 partner endpoints.

## 8) Готовые материалы для быстрого старта

- E2E smoke script:
  - `scripts/tms-partner-e2e.sh`
- Postman collection:
  - `docs/TMS-Partner-API.postman_collection.json`
