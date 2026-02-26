# Архитектура: логистика и комиссии по заказам

Цель: получать **фактические** затраты на логистику и комиссии по каждому заказу из API WB и Ozon для расчёта прибыли.

## Формула прибыли

```
Прибыль = Выручка − Себестоимость − Логистика − Комиссия
```

- **Выручка** — `Order.totalAmount` (уже есть)
- **Себестоимость** — `Material.cost` × количество или `Product.cost` (будущее)
- **Логистика** — из API маркетплейса
- **Комиссия** — из API маркетплейса

---

## Wildberries API

### Метод: `GET /api/v5/supplier/reportDetailByPeriod`

- **Базовый URL:** `https://statistics-api.wildberries.ru`
- **Токен:** категория «Статистика и Аналитика» (`statsToken` в `MarketplaceConnection`)
- **Лимит:** 1 запрос в минуту
- **Данные:** с 29 января 2024

### Параметры запроса

| Параметр | Тип | Описание |
|----------|-----|----------|
| dateFrom | string (RFC3339) | Начало периода (МСК) |
| dateTo | string (RFC3339) | Конец периода |
| rrdid | integer | ID последней строки (пагинация, 0 — старт) |
| limit | integer | До 100 000 строк (default: 100000) |
| period | "daily" \| "weekly" | Периодичность |

### Ключевые поля ответа (по заказу)

| Поле | Описание | Использование |
|------|----------|---------------|
| `srid` | Уникальный ID заказа WB | Связь с `Order.externalId` |
| `nm_id` | ID товара (номенклатура) | — |
| `quantity` | Количество | Только `quantity > 0` — реальные продажи |
| `doc_type_name` | Тип документа | «Продажа» — выкуп |
| `retail_amount` | Сумма продажи | — |
| `delivery_rub` | Стоимость доставки (руб) | **Логистика** |
| `commission_percent` | % комиссии | — |
| `ppvz_sales_commission` | Комиссия за продажу (руб) | **Комиссия** |
| `ppvz_for_pay` | К выплате | — |
| `order_dt` | Дата заказа | — |
| `sale_dt` | Дата выкупа | — |

**Важно:** одна строка = одна позиция. Заказ с 2 товарами = 2 строки. Нужна агрегация по `srid`.

### Связь с нашими заказами

- `Order.externalId` = `srid` (WB передаёт srid как marketplaceOrderId при синке)
- Фильтр: `quantity > 0`, `doc_type_name = "Продажа"`

---

## Ozon API

### Метод: `POST /v3/finance/transaction/list`

- **Базовый URL:** `https://api-seller.ozon.ru`
- **Токен:** основной API-ключ (категория «Финансы»)

### Параметры запроса

```json
{
  "filter": {
    "date": { "from": "2024-01-01T00:00:00Z", "to": "2024-01-31T23:59:59Z" },
    "operation_type": ["ClientOrderDelivered", "ClientOrderDeliveredToCustomer"],
    "posting_number": "12345678-0001-1"
  },
  "page": 1,
  "page_size": 100
}
```

### Ключевые поля ответа

| Поле | Описание | Использование |
|------|----------|---------------|
| `posting.posting_number` | Номер отправления | Связь с `Order.ozonPostingNumber` |
| `operation_type` | Тип операции | ClientOrderDelivered — выкуп |
| `amount` | Сумма операции | — |
| `accruals_for_sale` | Начисление за продажу | Выручка |
| `sale_commission` | Комиссия за продажу | **Комиссия** |
| `delivery_charge` | Стоимость доставки | **Логистика** |
| `items` | Товары в операции | — |

### Связь с нашими заказами

- `Order.ozonPostingNumber` = `Order.externalId` = `posting_number`
- Фильтр по `operation_type`: выкупленные заказы

---

## Модель данных

### Вариант: поля в Order (выбран)

Добавить в `Order`:

```prisma
logisticsCost    Decimal?  @map("logistics_cost") @db.Decimal(10, 2)
commissionAmount Decimal?  @map("commission_amount") @db.Decimal(10, 2)
costsSyncedAt    DateTime? @map("costs_synced_at")  // когда обновляли
```

**Плюсы:** просто, 1:1, без джойнов.  
**Минусы:** при нескольких товарах в заказе — суммарные значения (что и нужно для прибыли).

### Альтернатива: OrderCost (отдельная таблица)

Для детализации по позициям — если понадобится в будущем.

---

## Поток данных

1. **Синк заказов** (уже есть) → Order с `externalId`, `ozonPostingNumber`
2. **Синк затрат** (новый) → по DELIVERED заказам:
   - WB: `reportDetailByPeriod` за период → матч по `srid` → `logisticsCost`, `commissionAmount`
   - Ozon: `finance/transaction/list` по `posting_number` → `logisticsCost`, `commissionAmount`
3. **Расчёт прибыли** → `revenue - productCost - logisticsCost - commissionAmount`

---

## Требования к токенам

| Маркетплейс | Токен | Назначение |
|-------------|-------|------------|
| WB | statsToken | reportDetailByPeriod (категория «Статистика») |
| Ozon | apiKey | finance/transaction/list (категория «Финансы») |

WB: `statsToken` уже хранится для ФБО. Ozon: основной ключ должен иметь права на Финансы.
