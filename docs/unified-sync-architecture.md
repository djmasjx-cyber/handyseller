# Архитектура унифицированной синхронизации товаров

На основе документа «Архитектура унифицированной синхронизации товаров: от канонической модели до адаптивных стратегий».

## Проблема: Field Mapping vs Canonical Model

**Field Mapping** (прямое сопоставление): Product → WB, Product → Ozon, … — N² связей, хрупкость.

**Canonical Model**: Product → Canonical → WB, Product → Canonical → Ozon. Декуплинг, масштабируемость.

---

## Шаги реализации

### Шаг 1. Каноническая модель товара (CanonicalProduct) ✓

Единая, универсальная модель — «золотой стандарт».

| Категория | Атрибут | Тип | Описание |
|-----------|---------|-----|----------|
| Идентификация | canonical_sku | string | Внутренний уникальный код (Product.id) |
| | brand_name | string | Бренд |
| | product_type_id | number? | ID типа из справочника |
| | vendor_code | string | Артикул производителя |
| | barcode | string? | EAN/UPC |
| Описание | title | string | Основное название |
| | short_description | string? | Короткое (списки) |
| | long_description_plain | string? | Markdown |
| | long_description_html | string? | HTML |
| | seo_title | string? | SEO заголовок |
| | seo_keywords | string? | Ключевые слова |
| | seo_description | string? | SEO описание |
| Характеристики | attributes | {name, value}[] | Произвольные атрибуты |
| Мультимедиа | images | {url, alt_text, is_main}[] | Изображения |
| Ценообразование | price | number | Цена |
| | old_price | number? | Старая (скидка) |
| Запасы | stock_quantity | number | Остаток |
| Маркетинг | tags | string[] | "хит", "новинка", "акция" |

### Шаг 2. Адаптер входа (Product → Canonical)

Преобразование Product (БД) → CanonicalProduct.

### Шаг 3. ProductSynchronizerInterface

Единый контракт для всех адаптеров выхода:
- `convertToPlatform(canonical: CanonicalProduct): PlatformPayload`
- `createOrUpdateItem(canonical, mapping?): Promise<string>`
- `getItem(externalId): Promise<CanonicalProduct | null>`

### Шаг 4–5. Адаптеры выхода (Canonical → Platform)

Таблица соответствий полей (реализовано в convertToPlatform):

| Canonical | WB | Ozon | Яндекс Маркет | Avito |
|-----------|----|------|---------------|-------|
| title | characteristics[0] «Наименование» | name, attributes[4189] | offer.name | title |
| long_description_plain | characteristics[3] «Описание» | attributes[4190] | offer.description | description |
| vendor_code | supplierVendorCode | offer_id | offer.vendorCode | — |
| canonical_sku | vendorCode (vendor_code-1) | offer_id | offer.id | — |
| attributes | characteristics[id++] | (в разработке) | — | param |
| images | загрузка отдельно | items[0].images | offer.pictures | images |
| price | Prices API | price | offer.price.value | price |
| stock_quantity | Stocks API | stocks | offer.quantity | — |

### Шаг 6. Асинхронность (очереди) ✓

BullMQ + Redis:
- `POST /api/marketplaces/sync?async=1` — добавляет задачу в очередь, возвращает `{ jobId, message }`
- `GET /api/marketplaces/sync/status/:jobId` — статус задачи
- Redis в docker-compose

---

## Текущее состояние реализации

- `apps/api/src/modules/marketplaces/canonical/` — каноническая модель и продукт-to-canonical
- `BaseMarketplaceAdapter.convertToPlatform(canonical)` — реализован во всех адаптерах
- WB: `uploadFromCanonical` использует canonical напрямую
- Controller: при sync использует productToCanonical → canonicalToProductData для совместимости
- SEO: Product.seoTitle, seoKeywords, seoDescription — UI, маппинг в WB/Ozon
- Очереди: BullMQ + Redis, sync?async=1

---

## Порядок внедрения

1. CanonicalProduct DTO + InputAdapter
2. Рефакторинг BaseMarketplaceAdapter: добавить convertToPlatform
3. WildberriesAdapter — использовать canonical
4. OzonAdapter — реализовать convertToPlatform
5. YandexAdapter, AvitoAdapter — по мере необходимости
6. Документация по каждому адаптеру
