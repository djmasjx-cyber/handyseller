# Архитектура связок товаров с маркетплейсами

## Проблема

**Текущая связка через sku — ненадёжна:**
- `sku = WB-{userId8}-{nmId}` — фактически мы храним nmId в строке
- Артикул (article/vendorCode) редактируемый на всех маркетах → не подходит для связи
- Один Product связан максимум с одним маркетом (через префикс sku)
- Нет поддержки Ozon product_id (используется offer_id — редактируемый)
- Сложно масштабировать на Amazon, eBay и др.

## Рекомендуемая схема (по мировым практикам)

| Маркетплейс | Системный ID (неизменяемый) | Редактируемый артикул |
|-------------|----------------------------|------------------------|
| Wildberries | nm_id, imt_id              | vendorCode в карточке  |
| Ozon        | product_id                 | offer_id               |
| Amazon      | ASIN, FNSKU                 | Seller SKU             |
| eBay        | ItemID                      | SKU (опционально)      |

**Правила:**
1. Внутренний Product.id (UUID) — единственный источник правды
2. Связка — через **системные ID** маркетплейсов (не артикулы)
3. article — только для отображения, может меняться без разрыва связи

---

## Предлагаемая схема БД

### 1. Product (без изменений полей, меняется семантика)

```prisma
model Product {
  id          String   @id @default(uuid())
  displayId   Int      @unique
  userId      String
  title       String
  description String?
  price       Decimal
  imageUrl    String?
  // sku — DEPRECATED для связки. Оставить для обратной совместимости при миграции.
  // article — артикул продавца, только для отображения (редактируемый)
  sku         String?  @unique  // Legacy, убрать после миграции
  article     String?
  stock       Int
  ...
}
```

### 2. ProductMarketplaceMapping (новая таблица)

```prisma
model ProductMarketplaceMapping {
  id                  String          @id @default(uuid())
  productId           String          @map("product_id")
  userId              String          @map("user_id")
  marketplace         MarketplaceType

  // Системные ID маркетплейсов (НЕ артикулы!)
  externalSystemId    String          @map("external_system_id")  // nm_id (WB), product_id (Ozon), ASIN, ItemID

  // Опционально: вторичный ID для WB (группа характеристик)
  externalGroupId     String?         @map("external_group_id")   // imt_id для WB

  // Редактируемые метаданные для отображения (не для связки)
  externalArticle     String?         @map("external_article")    // vendorCode, offer_id — только UI

  syncStock           Boolean         @default(true) @map("sync_stock")
  isActive            Boolean         @default(true) @map("is_active")

  product             Product         @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([userId, marketplace, externalSystemId])
  @@index([productId])
  @@index([userId, marketplace])
}
```

**Почему один `externalSystemId` (string), а не отдельные колонки:**
- Проще добавлять новые маркеты без миграций
- У каждого маркета свой формат: WB nm_id (число), Ozon product_id (число), ASIN (строка)
- В коде по `marketplace` интерпретируем значение

---

## Миграция с текущей схемы

### Этап 1: Добавить ProductMarketplaceMapping

1. Создать миграцию Prisma с новой таблицей.
2. Миграция данных: для каждого Product где `sku LIKE 'WB-%'`:
   - Извлечь nmId regex: `WB-[^-]+-(\d+)`
   - Создать запись: `{ productId, userId, marketplace: WILDBERRIES, externalSystemId: nmId }`
3. Адаптеры начинают искать связку через mapping, с fallback на sku.

### Этап 2: Обновить импорт WB

- При импорте: создавать Product + ProductMarketplaceMapping (externalSystemId = nmId).
- Перестать записывать sku на Product (или оставить для legacy, но не использовать).

### Этап 3: Обновить все точки использования

| Место | Было | Стало |
|-------|------|-------|
| Stock sync | sku → nmId | mapping.externalSystemId |
| Orders (поиск товара) | findBySku(sku) | findByMapping(marketplace, externalId) |
| getProductStockWb | sku.match → nmId | mapping.externalSystemId |
| WildberriesAdapter.syncProducts | product.sku → nmId | product.marketplaceMappings |

### Этап 4: Deprecate sku

- Удалить запись sku при импорте (или nullable).
- Убрать findBySku для маркетплейс-связок.

---

## Алгоритм синхронизации остатков

```
1. Изменение stock на Product (наш склад)
      ↓
2. Событие product.sync.changed → StockSyncListener (остаток, цена, описание, название и др.)
      ↓
3. Для каждого подключённого маркетплейса (WB, Ozon, …):
   • enrichProductsWithMarketplaceMappings — добавляет wbNmId/ozonProductId из ProductMarketplaceMapping
   • adapter.syncProducts — обновляет цену, остаток, описание, название и атрибуты на маркете
      ↓
4. WB: nm_id из mapping → PUT /api/v3/stocks
   Ozon: product_id + offer_id из mapping → POST /v2/products/stocks (ProductAPI_ProductsStocksV2)
      ↓
5. Остаток = Product.stock (источник правды)
```

**Поля для синхронизации:**
- `Product.stock` — единственный источник остатков
- `ProductMarketplaceMapping.externalSystemId` — ID на маркете (nm_id для WB, product_id для Ozon)
- `ProductMarketplaceMapping.syncStock` — включена ли синхронизация (по умолчанию true)
- `Product.article` — артикул; передаётся как `vendorCode` при выгрузке на Ozon (offer_id)

**ProductData при авто-синхронизации (StockSyncListener):**
| Поле | Источник | Назначение |
|------|----------|------------|
| id, name, price, stock | Product | Обновление на маркете |
| description, brand, weight, dimensions, color, material, … | Product | Синхронизация описания и атрибутов на WB/Ozon |
| vendorCode | Product.article \|\| Product.sku | Ozon: offer_id при первичной выгрузке |
| wbNmId / ozonProductId | enrichProductsWithMarketplaceMappings | Берётся из ProductMarketplaceMapping |

---

## Ozon: product_id vs offer_id

- **product_id** — системный ID товара (неизменяемый)
- **offer_id** — артикул продавца (редактируемый)

При создании товара на Ozon API возвращает `product_id`. Его нужно сохранять в `externalSystemId`.
API остатков Ozon использует `product_id`.

## Связка по артикулу (fallback)

Если товар создан на маркете вручную с тем же артикулом, что и в каталоге HandySeller:

1. **WB:** при импорте заказа — fallback: поиск по `article` (vendorCode), sku, sku suffix
2. **Ozon:** при импорте заказа — fallback: по `product_id` запрашиваем `offer_id` через API, ищем Product по `article = offer_id`, создаём маппинг и возвращаем товар

Таким образом, при совпадении артикула (Product.article = Ozon offer_id) заказ автоматически связывается с товаром, даже без предварительного импорта.

---

## Заказы и обновление остатков

При поступлении заказа с маркетплейса:

1. **Поиск товара:** `findProductByMarketplaceId(marketplace, productId)`:
   - Сначала — ProductMarketplaceMapping по externalSystemId
   - WB: fallback по sku, sku suffix, article
   - Ozon: fallback — получить offer_id по product_id, найти по article, создать маппинг

2. **Резервирование:** `stockService.reserve(productId)` — уменьшает Product.stock

3. **Синхронизация:** событие `product.sync.changed` → StockSyncListener → обновление остатков, цены, описания и атрибутов на всех маркетах (WB, Ozon и т.д.)

Итог: при заказе с любого маркета остатки обновляются везде автоматически.

---

## Масштабирование

Для нового маркета (Amazon, eBay):
1. Добавить значение в enum MarketplaceType.
2. Реализовать адаптер.
3. При импорте/создании — создавать ProductMarketplaceMapping с externalSystemId = ASIN/ItemID.
4. Схема БД не меняется.

---

## Итог

| Аспект | Решение |
|--------|---------|
| Связка | ProductMarketplaceMapping.externalSystemId (системные ID) |
| Артикул | Product.article — отображение + fallback при заказах |
| Один товар — несколько маркетов | Да: несколько mapping на один Product |
| Восстановление при смене артикула | Да: связка не зависит от артикула |
| Миграция | Поэтапная с fallback на sku |

## Рекомендации по артикулу

Для корректной работы связки по артикулу (fallback при заказах):

1. **Единый артикул** — используйте одинаковый артикул в HandySeller (`Product.article`) и на маркете (WB vendorCode, Ozon offer_id).
2. **Импорт с маркета** — при «Загрузить с WB/Ozon» артикул подтягивается и создаётся связка.
3. **Ручное создание на маркете** — если товар создан вручную с тем же артикулом, при первом заказе система найдёт товар по артикулу и создаст маппинг автоматически.

---

## Ключевые файлы

| Файл | Назначение |
|------|------------|
| `apps/api/src/modules/marketplaces/stock-sync.listener.ts` | Слушает `product.sync.changed`, синхронизирует остаток, цену, описание и атрибуты с WB/Ozon |
| `apps/api/src/modules/marketplaces/marketplaces.service.ts` | `syncProducts`, `enrichProductsWithMarketplaceMappings`, `getOzonOfferIdByProductId` |
| `apps/api/src/modules/marketplaces/product-mapping.service.ts` | `findProductByExternalId`, `upsertMapping`, `getExternalId` |
| `apps/api/src/modules/orders/orders.service.ts` | `findProductByMarketplaceId` — поиск товара по заказу (mapping + fallback по артикулу) |
| `apps/api/src/modules/marketplaces/adapters/ozon.adapter.ts` | `syncProducts`, `updateProduct`, `getProductInfoByProductId`, `getProductInfoByOfferId` |
| `apps/api/src/modules/marketplaces/adapters/wildberries.adapter.ts` | `syncProducts`, `updateProduct` |
| `apps/api/prisma/schema.prisma` | Модель `ProductMarketplaceMapping` |
