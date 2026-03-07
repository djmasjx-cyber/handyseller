# Анализ: FBO остатки Ozon — разбор по полочкам

## 1. Цепочка запросов (как сейчас)

```
[Products Page] 
    → GET /api/marketplaces/ozon-fbo-stock
        → MarketplacesService.getOzonStockFbo(userId)
            → 1. Prisma: productMarketplaceMapping (OZON, isActive)
            → 2. identifiers = externalArticle ?? externalSystemId
            → 3. OzonAdapter.getStocksFbo(identifiers)
                → POST /v4/product/info/stocks { filter: { visibility, product_id | offer_id } }
            → 4. Маппинг parsed[key] → result[productId]
```

---

## 2. Результат каждого шага

### Шаг 1: Маппинги из БД

| Поле | Значение | Описание |
|------|----------|----------|
| `productId` | UUID | Наш внутренний ID товара |
| `externalSystemId` | `"3539667328"` | Ozon product_id (числовой) |
| `externalArticle` | `"ART-123"` или `"OZON_3539667328"` | offer_id (артикул) или placeholder |

**Проблема для placeholder-товаров:**  
`externalArticle = "OZON_3539667328"` — это наш артикул, Ozon его не знает. В API нужно передавать `product_id = 3539667328`.

---

### Шаг 2: Формирование identifiers

**Текущая логика:**
```ts
identifiers = mappings.map(m => m.externalArticle ?? m.externalSystemId)
```

| Тип товара | externalArticle | externalSystemId | identifiers[i] |
|------------|-----------------|------------------|----------------|
| Обычный | "ART-123" | "3539667328" | "ART-123" ✓ |
| Placeholder | "OZON_3539667328" | "3539667328" | "OZON_3539667328" ✗ |

**Итог:** для placeholder отправляется `"OZON_3539667328"` вместо `"3539667328"` — Ozon такой offer_id не найдёт.

---

### Шаг 3: Разделение на product_id и offer_id

**Текущая логика:**
```ts
productIds = identifiers.filter(id => /^\d+$/.test(id))  // только числа
offerIds   = identifiers.filter(id => !/^\d+$/.test(id))
// Один запрос: if (productIds.length) → product_id, else → offer_id
```

| Ситуация | productIds | offerIds | Что уходит в API |
|----------|------------|----------|-------------------|
| 100 offer_id, 5 product_id | [5] | [100] | **Только product_id** (5 шт) — 100 товаров не запрашиваются |
| 5 offer_id, 100 product_id | [100] | [5] | **Только product_id** (100 шт) — 5 товаров не запрашиваются |

**Итог:** в одном запросе используется только один тип идентификатора. Товары с другим типом не попадают в запрос.

---

### Шаг 4: Запрос к Ozon API

**Эндпоинт:** `POST https://api-seller.ozon.ru/v4/product/info/stocks`

**Тело запроса:**
```json
{
  "filter": {
    "visibility": "ALL",
    "product_id": [3539667328, 2767959370]   // или "offer_id": ["ART-123", ...]
  }
}
```

**Ограничения Ozon:**
- до 100 товаров на запрос;
- пагинация через `last_id`.

**Текущая реализация:** один запрос, пагинация не используется.

---

### Шаг 5: Ответ Ozon API

**Ожидаемая структура:**
```json
{
  "result": {
    "items": [
      {
        "product_id": 3539667328,
        "offer_id": "ART-123",
        "stock": 10,
        "stocks": [
          { "warehouse_id": 123, "type": "fbo", "present": 5, "reserved": 0 },
          { "warehouse_id": 456, "type": "fbs", "present": 5, "reserved": 2 }
        ]
      }
    ],
    "total": 1,
    "last_id": "..."
  }
}
```

**Варианты структуры `stocks`:**
- `stocks[]` с `type: "fbo"` / `"fbs"` — разбивка по складам;
- `stock` — общий остаток (если `stocks` пустой).

**Текущий парсинг:** суммируем `present` только где `type === "fbo"`.

---

### Шаг 6: Маппинг результата на productId

**Текущая логика:**
```ts
key = item.offer_id ?? String(item.product_id)
result[m.productId] = byProductOrOffer[key]
```

**Проблема:** `key` в ответе — это `offer_id` или `product_id`. В `byProductOrOffer` ключи — это `identifiers`, которые мы отправили. Если отправили `product_id`, а Ozon вернул `offer_id` — ключи могут не совпасть. Нужна двусторонняя связка: identifier → productId.

---

## 3. Выявленные проблемы

| # | Проблема | Влияние |
|---|----------|---------|
| 1 | Placeholder: `externalArticle` вместо `externalSystemId` | Ozon не находит товар по `"OZON_3539667328"` |
| 2 | Один тип ID на запрос (product_id **или** offer_id) | Часть товаров не запрашивается |
| 3 | Нет пагинации | При >100 товарах часть не получаем |
| 4 | Нет батчинга по 100 | Ozon может отклонить или обрезать запрос |
| 5 | Несоответствие ключей при маппинге | Ответ по offer_id может не смапиться на product_id и наоборот |

---

## 4. Архитектурно верное решение

### 4.1. Формирование идентификаторов

Для каждого маппинга нужен **идентификатор для Ozon API**:

```ts
// Для Ozon API: product_id приоритетнее (надёжнее для FBO)
function getOzonIdentifier(m: Mapping): { type: 'product_id' | 'offer_id'; value: string } {
  if (m.externalSystemId && /^\d+$/.test(m.externalSystemId))
    return { type: 'product_id', value: m.externalSystemId }
  const offer = (m.externalArticle ?? m.externalSystemId ?? '').trim()
  if (offer && !offer.startsWith('OZON_'))  // не placeholder
    return { type: 'offer_id', value: offer }
  if (m.externalSystemId) return { type: 'product_id', value: m.externalSystemId }
  return null
}
```

Placeholder: `externalArticle = "OZON_3539667328"` → используем `externalSystemId = "3539667328"`.

---

### 4.2. Два типа запросов и объединение

1. Собрать `productIds` и `offerIds` из маппингов.
2. Сделать **два набора запросов** (с пагинацией и батчингом по 100):
   - по `product_id`;
   - по `offer_id`.
3. Объединить результаты в один `Record<string, number>`.

---

### 4.3. Пагинация и батчинг

```ts
async function fetchAllStocks(identifiers: string[], filterKey: 'product_id' | 'offer_id') {
  const BATCH = 100
  const result: Record<string, number> = {}
  let lastId: string | undefined

  do {
    const batch = identifiers.slice(0, BATCH)
    identifiers = identifiers.slice(BATCH)
    const filter = filterKey === 'product_id'
      ? { product_id: batch.map(Number) }
      : { offer_id: batch }
    const { data } = await api.post('/v4/product/info/stocks', {
      filter: { visibility: 'ALL', ...filter },
      last_id: lastId,
    })
    // merge data.result.items into result
    lastId = data?.result?.last_id
  } while (lastId && identifiers.length > 0)
  return result
}
```

---

### 4.4. Маппинг ответа → productId

Нужна обратная связка: по каждому `identifier` знать `productId`.

```ts
// При формировании запроса
const idToProductId = new Map<string, string>()
for (const m of mappings) {
  const id = getOzonIdentifier(m)
  if (id) idToProductId.set(id.value, m.productId)
}
// При разборе ответа
for (const item of items) {
  const key = item.offer_id ?? String(item.product_id)
  const productId = idToProductId.get(key) ?? idToProductId.get(String(item.product_id)) ?? ...
  if (productId) result[productId] = fboStock
}
```

Важно учитывать, что Ozon может вернуть и `offer_id`, и `product_id`, и нужно проверять оба при поиске `productId`.

---

### 4.5. Структура ответа Ozon

Перед финальной реализацией стоит проверить фактическую структуру ответа:

1. Нажать «FBO debug» на странице товаров.
2. Посмотреть `diagnostic.response` — реальные поля в `items[].stocks`.
3. Убедиться, что `type` бывает `"fbo"`, `"fbs"` и нет ли других вариантов.

---

## 5. План внедрения

1. **Исправить identifiers** — для Ozon API использовать `externalSystemId` (product_id), когда он числовой, в т.ч. для placeholder.
2. **Два типа запросов** — отдельно по `product_id` и по `offer_id`, объединять результаты.
3. **Батчинг по 100** — резать массивы на чанки по 100.
4. **Пагинация** — цикл с `last_id`, пока есть следующая страница.
5. **Надёжный маппинг** — строить `identifier → productId` и использовать при разборе ответа.
6. **Расширить диагностику** — в debug выводить сырой ответ и промежуточные шаги для отладки.

---

## 6. Файлы для правок

| Файл | Изменения |
|------|-----------|
| `marketplaces.service.ts` | `getOzonStockFbo`, `getOzonFboStockDiagnostic` — новая логика identifiers и маппинга |
| `ozon.adapter.ts` | `getStocksFbo`, `getStocksFboRaw` — два типа запросов, батчинг, пагинация |
