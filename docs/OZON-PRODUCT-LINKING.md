# Связки HandySeller ↔ Ozon: поля идентификации товара

## Таблица соответствия полей

| HandySeller | Ozon | Назначение | Изменяемость |
|-------------|------|------------|--------------|
| `Product.id` | — | Внутренний UUID товара | Неизменяемый |
| `Product.displayId` | — | Человекочитаемый ID (0001, 0002…) | Системный |
| `Product.article` | `offer_id` | Артикул продавца (отображение) | **Редактируемый** |
| `ProductMarketplaceMapping.externalSystemId` | `product_id` | Системный ID Ozon | **Неизменяемый** |
| `ProductMarketplaceMapping.externalArticle` | `offer_id` | Артикул, фактически использованный на Ozon | Хранится при выгрузке |

## Ключевая связка для API

**Ozon API** (остатки, цены, заказы) использует:
- `product_id` — единственный надёжный идентификатор (Ozon не меняет его)
- `offer_id` — артикул продавца (можно редактировать в ЛК Ozon)

**При обновлении остатков** (`POST /v2/products/stocks`) требуется передать **оба**:
```json
{
  "stocks": [{
    "offer_id": "артикул-как-на-озоне",
    "product_id": 123456789,
    "stock": 10,
    "warehouse_id": 1020005007149260
  }]
}
```

## Правило приоритета offer_id

**Проблема:** `Product.article` может быть изменён пользователем после выгрузки на Ozon. На Ozon остаётся старый `offer_id`.

**Решение:** При синхронизации с Ozon **всегда** использовать `externalArticle` из маппинга (если есть), а не `Product.article`.

| Источник | Когда использовать |
|----------|-------------------|
| `ProductMarketplaceMapping.externalArticle` | Приоритет — это фактический offer_id на Ozon |
| `Product.article` | Fallback только если externalArticle пуст |

## Создание маппинга

| Сценарий | externalSystemId | externalArticle |
|----------|------------------|------------------|
| Выгрузка через HandySeller | product_id из ответа Ozon | vendorCode (sanitized) |
| Импорт с Ozon | product_id из API | offer_id из API |
| Заказ с Ozon (fallback по артикулу) | product_id из заказа | offer_id из API |

## Диагностика связок

```bash
GET /api/marketplaces/ozon-debug/:productId
```
**Таблица полей HandySeller ↔ Ozon:**
- `handyseller`: productId, displayId, article, sku
- `mapping`: externalSystemId (product_id), externalArticle (offer_id в БД)
- `ozon`: product_id, offer_id, name (с API)
- `syncWillUseOfferId`: какой offer_id будет передан при синхронизации остатков
- `match`: совпадает ли наш offer_id с Ozon

```bash
GET /api/marketplaces/ozon-stock/:article
```
Возвращает: `localStock`, `ozonProductId`, `offer_id`, `warehouseConfigured`, `error`

```bash
GET /api/marketplaces/ozon-check/:productId
```
Возвращает: `exists`, `ozonProductId`, `offer_id`, `hint` (найдено по артикулу)

## Проверка целостности

1. **Маппинг есть, остатки не уходят** → проверить `warehouse_id` в подключении Ozon
2. **Ошибка API при setStock** → `offer_id` в запросе не совпадает с Ozon → использовать `externalArticle`
3. **Товар не привязан** → `ProductMarketplaceMapping` отсутствует → выгрузить товар или импортировать с Ozon
