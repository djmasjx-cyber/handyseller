# TMS Partner API Field Guide (Plain Language)

Этот гайд для разработчика, который впервые подключает checkout сайта к HandySeller.
Без сложной терминологии: что отправлять, что получать, что хранить у себя.

## 1) Что вы строите

Вы подключаете блок доставки в корзине:
- запросить варианты доставки;
- показать их покупателю;
- принять выбор;
- подтвердить заказ у перевозчика;
- сохранить трек-номер.

Рабочая цепочка endpoint-ов:
- `POST /api/tms/oauth/token`
- `POST /api/tms/v1/shipments/estimate`
- `POST /api/tms/v1/shipments/{requestId}/select`
- `POST /api/tms/v1/shipments/{requestId}/confirm`
- `GET /api/tms/v1/shipments/{shipmentId}` и `.../events`

## 2) Что хранить в вашей БД

После каждого этапа сохраняйте связку:
- `externalOrderId` (ваш id заказа на сайте),
- `shipmentRequestId` (из `estimate`),
- `selectedQuoteId` (выбранный тариф),
- `shipmentId` (из `confirm`),
- `trackingNumber` (из `confirm`),
- `carrierId`/`carrierName`.

Это позволит всегда восстановить состояние доставки.

## 3) Запрос `estimate`: какие поля реально нужны

### 3.1 `snapshot` (снимок заказа)

- `userId`: чей это заказ в вашем контуре.
- `originLabel`: откуда отправлять (склад/город/адрес).
- `destinationLabel`: куда доставлять.
- `cargo.weightGrams`: вес.
- `cargo.widthMm`, `cargo.lengthMm`, `cargo.heightMm`: габариты (очень желательно).
- `cargo.declaredValueRub`: объявленная стоимость.
- `itemSummary[].title`: название товара.
- `contacts.shipper.name`, `contacts.shipper.phone`: контакт отправителя.
- `contacts.recipient.name`, `contacts.recipient.phone`: контакт получателя.

### 3.2 `draft` (черновик маршрута)

- `originLabel`, `destinationLabel`: продублируйте адреса.
- `serviceFlags`: обычно `["EXPRESS"]` для экспресс-профиля.

### 3.3 `integration` (ваша внешняя идентификация)

- `externalOrderId`: ваш id заказа.
- `orderType`: обычно `CLIENT_ORDER`.

## 4) Ответ `estimate`: как отрисовать варианты в корзине

Берите из `options[]`:
- `quoteId` -> технический id варианта (скрытое значение в UI),
- `carrierName` -> название способа доставки,
- `priceRub` -> стоимость,
- `etaDays` -> срок,
- `notes` -> доп. описание (опционально).

В UI это обычно выглядит как:
- `Деловые Линии - 610 руб - 2 дня`,
- `CDEK - 650 руб - 3 дня`.

`shipmentRequestId` храните у себя сразу после `estimate`.

## 5) Когда пользователь выбрал вариант

### 5.1 Запрос `select`

Вызов:
- `POST /api/tms/v1/shipments/{requestId}/select`

Тело:

```json
{
  "quoteId": "q_..."
}
```

После этого выбранный тариф зафиксирован за `requestId`.

### 5.2 Запрос `confirm`

Вызов:
- `POST /api/tms/v1/shipments/{requestId}/confirm`

Этот шаг создает бронирование/заказ у перевозчика.

## 6) Ответ `confirm`: что вернуть в ваш checkout/order

Ключевые поля:
- `id` -> `shipmentId`,
- `trackingNumber` -> трек-номер для клиента,
- `carrierName`,
- `status`.

Минимум, что стоит вернуть в ваш order-service:

```json
{
  "deliveryProvider": "Деловые Линии",
  "trackingNumber": "DELLIN-REQ-123456789",
  "shipmentId": "shp_01J...",
  "deliveryStatus": "CONFIRMED"
}
```

## 7) Идемпотентность (очень важно)

Для write-операций (`estimate`, `select`, `confirm`) передавайте `Idempotency-Key`.
Если сеть обрывается и вы делаете retry с тем же ключом, вы не создадите дубль.

Пример:
- `Idempotency-Key: confirm-<externalOrderId>-v1`

## 8) Типичные ошибки и что делать

- `401/403` -> неверный или просроченный OAuth токен.
- `400 validation` -> не хватает обязательных полей в payload.
- `429` -> rate limit внешнего перевозчика, нужен backoff и повтор через паузу.
- `5xx` -> временная ошибка, повторить с exponential backoff.

Рекомендованный retry:
- 1s, 2s, 5s, 10s;
- не более 3-5 попыток на один шаг.

## 9) Webhook + pull fallback

Webhook нужен для быстрых обновлений статусов.
Но даже с webhook добавьте периодический pull:
- `GET /api/tms/v1/shipments/{shipmentId}/events`
- `GET /api/tms/v1/shipments?updatedSince=...`

Это защищает от пропущенных callback-ов.

## 10) Чек-лист перед go-live

- OAuth токен успешно выдается.
- `estimate` возвращает минимум 1 вариант доставки.
- `select` успешно принимает выбранный `quoteId`.
- `confirm` возвращает `trackingNumber`.
- `trackingNumber` записывается в заказ клиента.
- Webhook подпись проверяется (`X-Handyseller-Signature`).
- Включен pull fallback по расписанию.
