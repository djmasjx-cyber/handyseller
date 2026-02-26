# Ozon: API остатков и интеграция с HandySeller

## Ссылка на интерфейс Ozon

**URL:** https://seller.ozon.ru/app/stocks/warehouse/1020005007149260?filter=STOCK_STATUS_VISIBLE

Это страница «Остатки» в личном кабинете Ozon:
- `warehouse/1020005007149260` — ID склада (FBS), для которого отображаются остатки
- `filter=STOCK_STATUS_VISIBLE` — фильтр: товары с видимым статусом (доступны к заказу)

**Важно:** `warehouse_id` из URL должен совпадать с `warehouseId` в настройках подключения Ozon в HandySeller.

---

## Ozon API: обновление остатков

### Endpoint (используется в приложении)

| Параметр | Значение |
|----------|----------|
| Метод | POST |
| URL | `https://api-seller.ozon.ru/v2/products/stocks` |
| Документация | https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsStocksV2 |

### Тело запроса

```json
{
  "stocks": [
    {
      "offer_id": "артикул-продавца",
      "product_id": 123456789,
      "stock": 10,
      "warehouse_id": 1020005007149260
    }
  ]
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| offer_id | string | Артикул продавца (должен совпадать с offer_id на Ozon) |
| product_id | number | Системный ID товара Ozon |
| stock | number | Количество на складе |
| warehouse_id | number | ID склада из `/v1/warehouse/list` |

### Получение остатков (v4)

Для **чтения** остатков с Ozon используется:
- **POST** `/v4/product/info/stocks` — получить остатки по товарам
- Фильтры: `visibility`, `offer_id`, `last_id` (пагинация)

---

## Интеграция в HandySeller

### Цепочка отправки остатков

1. **Изменение остатка** → `StockService.change()` / `reserve()` / `release()`
2. **Событие** → `product.sync.changed` (EventEmitter)
3. **StockSyncListener** → `marketplacesService.syncProducts(userId, [productData])`
4. **enrichProductsWithMarketplaceMappings** → добавляет `ozonProductId` из `ProductMarketplaceMapping`
5. **OzonAdapter.syncProducts** → для товара с `ozonProductId` вызывает `updateProduct`
6. **updateProduct** → при `product.stock !== undefined` вызывает `setStock(offerId, productId, stock)`
7. **setStock** → POST `/v2/products/stocks`

### Условия успешной синхронизации

| Условие | Где проверить |
|---------|---------------|
| Ozon подключён | Маркетплейсы → Подключенные → Ozon |
| warehouse_id указан | Маркетплейсы → Ozon → «Загрузить склады» → выбрать склад |
| Товар привязан к Ozon | ProductMarketplaceMapping (externalSystemId = product_id) |
| offer_id совпадает | Product.article = offer_id на Ozon (или externalArticle в mapping) |

### Пошаговая диагностика

```bash
GET /api/marketplaces/ozon-stock-debug/:article
```

Возвращает по шагам: step1_product, step2_mapping, step3_connection, step4_getStocks (запрос/ответ v4), step5_setStock (запрос/ответ v2). При ошибке — stepN_error.

Пример (артикул edc002):
```bash
curl -s "http://158.160.209.158:3000/api/marketplaces/ozon-stock-debug/edc002" -H "Authorization: Bearer $TOKEN" | jq .
```

### Диагностика

```bash
# Статус остатков по артикулу
GET /api/marketplaces/ozon-stock/:article

# Принудительная синхронизация
POST /api/marketplaces/ozon-stock/:article/sync
```

Ответ `getOzonStock`:
- `warehouseConfigured: false` → не указан ID склада
- `error: "Товар не привязан к Ozon"` → нет маппинга (product_id)

---

## Типичные причины ошибок

| Симптом | Причина | Решение |
|---------|---------|---------|
| Остатки не уходят | warehouse_id не указан | Маркетплейсы → Ozon → «Загрузить склады» → выбрать склад |
| Остатки не уходят | Товар не привязан | Выгрузить товар на Ozon или «Загрузить с Ozon» |
| Ошибка API | offer_id не совпадает | Product.article должен совпадать с offer_id на Ozon |
| Ошибка API | offer_id содержит недопустимые символы | sanitizeOfferId: только буквы, цифры, дефис, подчёркивание |

## warehouse_id из URL

Если в URL `https://seller.ozon.ru/app/stocks/warehouse/1020005007149260` указан склад **1020005007149260** — это именно тот ID, который нужно указать в настройках Ozon в HandySeller.

Список складов можно получить через API:
- **POST** `/v1/warehouse/list` — возвращает `{ result: [{ warehouse_id, name }] }`

В HandySeller: Маркетплейсы → Ozon → «Загрузить склады» — вызывает этот endpoint и позволяет выбрать склад по названию.
