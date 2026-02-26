# Аудит полей карточки товара: HandySeller ↔ маркетплейсы

> Цель: обеспечить соответствие полей нашей карточки обязательным требованиям Ozon, Wildberries и Яндекс.Маркет. Не упустить критичные поля.

## 1. Наши поля (Product + CanonicalProduct)

| Поле HandySeller | Тип | Обязательность | Описание |
|------------------|-----|----------------|----------|
| **title** | string | ✓ | Название |
| **description** | string? | опц. | Описание |
| **price** | Decimal | ✓ | Цена |
| **article** | string? | опц. | Артикул продавца |
| **imageUrl** | string? | опц. | URL главного фото (одно!) |
| **sku** | string? | legacy | WB nm_id, Ozon product_id |
| **seoTitle** | string? | опц. | SEO-заголовок |
| **seoKeywords** | string? | опц. | SEO-ключевые слова |
| **seoDescription** | string? | опц. | SEO-описание |
| **barcodeWb** | string? | опц. | Штрих-код WB |
| **barcodeOzon** | string? | опц. | Штрих-код Ozon |
| **stock** | int | ✓ | Остаток |

---

## 2. Wildberries — обязательные поля

| Поле WB | Обязательно | Маппинг в HandySeller | Статус |
|---------|-------------|------------------------|--------|
| **subjectID** (ID предмета) | ✓ | ❌ отсутствует | **Нужно добавить** |
| **vendorCode** | ✓ | article | ✓ есть |
| **brand** | ✓ | ❌ отсутствует | **Нужно добавить** |
| **title** | ✓ | title | ✓ есть |
| **description** | ✓ | description | ✓ есть |
| **characteristics** | ✓ (по категории) | attributes / ручной ввод | частично |
| **dimensions** (width, height, length, weightBrutto) | ✓ | ❌ отсутствует | **Нужно добавить** |
| **images** | ✓ (рекоменд. несколько) | imageUrl (одно) | **Нужно: массив изображений** |

Характеристики зависят от категории: `GET /content/v2/object/charcs/{id}`.

---

## 3. Ozon — обязательные поля

> **Подробный анализ:** см. [OZON-FIELDS-ANALYSIS.md](./OZON-FIELDS-ANALYSIS.md)

| Поле Ozon | Обязательно | Маппинг | Статус |
|-----------|-------------|---------|--------|
| **offer_id** | ✓ | article | ✓ есть |
| **name** | ✓ | title | ✓ есть |
| **barcode** | ✓ | barcodeOzon | ✓ есть (или генерация EAN-13) |
| **price** | ✓ | price | ✓ есть |
| **description_category_id** | ✓ | захардкожено 17028922 | ⚠️ нужен выбор категории |
| **type_id** | ✓ | захардкожено 91565 | ⚠️ нужен выбор типа |
| **images** (≥1) | ✓ | imageUrl | ✓ есть |
| **height, width, depth** | ✓ | weight, width, length, height (fallback 100) | ✓ есть |
| **weight** | ✓ | weight (fallback 100 г) | ✓ есть |
| **vat** | ✓ | '0' | ✓ |
| **old_price** | ✓ | price * 1.25 | ✓ |
| **description** | рекомендуемо | description + richContent + доп. поля | ✓ есть |
| **attributes** | ✓ (по категории) | только 9048 (Название модели) | ⚠️ неполно: бренд, цвет и др. |
| **brand** (атрибут) | часто обяз. | brand → в description, не в attributes | ⚠️ нужно в attributes |

Атрибуты зависят от категории. Коды 4189 (название) и 4190 (описание) — базовые. Обычно ещё нужны бренд, цвет, страна и др.

---

## 4. Яндекс.Маркет — обязательные поля

| Поле Яндекс | Обязательно | Маппинг | Статус |
|-------------|-------------|---------|--------|
| **id** (SKU) | ✓ | article \| id | ✓ есть |
| **url** | ✓ | ❌ отсутствует | **Нужно добавить** (или генерировать) |
| **vendor** | ✓ | захардкожено "Ручная работа" | ⚠️ лучше поле бренд |
| **model** | ✓ | title | ✓ есть |
| **typePrefix** | ✓ | ❌ отсутствует | **Нужно добавить** |
| **price** | ✓ | price | ✓ есть |
| **currencyId** | ✓ | RUR | ✓ |
| **name** | ✓ | title | ✓ есть |
| **description** | рекомендуемо | description | ✓ есть |
| **pictures** | ✓ (≥1) | imageUrl | ✓ есть |
| **weightDimensions** | ✓ | захардкожено | ⚠️ нужны реальные |

---

## 5. Чего не хватает в HandySeller (сводка)

### Критично (обязательно на маркетах)

| Поле | WB | Ozon | Яндекс | Действие |
|------|----|------|--------|----------|
| **brand** / бренд | ✓ | опц. | vendor | Добавить `brand` (string) |
| **subjectID** (WB) | ✓ | — | — | Добавить `wbSubjectId` (number?) или выбор категории |
| **dimensions** (габариты, вес) | ✓ | ✓ | ✓ | Добавить: `weight`, `width`, `length`, `height` |
| **url** (страница товара) | — | — | ✓ | Добавить `productUrl` или генерировать |
| **typePrefix** (тип товара) | — | — | ✓ | Добавить `typePrefix` |

### Важно (рекомендуется)

| Поле | Описание |
|------|----------|
| **images[]** | Массив URL фото (сейчас одно imageUrl) |
| **Реальные габариты** | Сейчас захардкожены 100×100×100, 100г |
| **Категория/тип** | Сейчас захардкожены — нужен выбор по маркету |

### Уже покрыто

- title, description, price, article
- seoTitle, seoKeywords, seoDescription
- barcodeWb, barcodeOzon
- stock

---

## 6. План доработок (приоритет)

### Фаза 1 — Минимум для прохождения модерации

1. **brand** (бренд) — обязателен на WB, используется на Яндексе.
2. **weight, width, length, height** — обязательны на WB и Ozon, рекомендуется на Яндексе.
3. **productUrl** — обязателен на Яндексе (можно генерировать: `https://handyseller.ru/product/{id}`).

### Фаза 2 — Корректная категоризация

4. **wbSubjectId** — ID предмета WB (зависит от категории).
5. **ozonCategoryId** / **ozonTypeId** — для Ozon (зависит от категории).
6. **typePrefix** — для Яндекса (тип товара: «украшение», «сувенир» и т.п.).

### Фаза 3 — Улучшения

7. **images[]** — несколько фото вместо одного.
8. **characteristics** — гибкие атрибуты по категории (справочники маркетов).

---

## 7. Маппинг Product → CanonicalProduct (текущий)

```ts
// product-to-canonical.adapter.ts
vendor_code: article ?? sku
barcode: barcodeOzon ?? barcodeWb
title: title
short_description: description (первые 150 символов)
long_description_plain: description
seo_title: seoTitle
seo_keywords: seoKeywords
seo_description: seoDescription
price: price
```

**Не маппятся:** brand, dimensions, productUrl, typePrefix, wbSubjectId.

---

## 8. Источники

- [WB Content API](https://dev.wildberries.ru/openapi/wbd) — карточки товаров
- [Ozon Seller API](https://docs.ozon.ru/api/seller/) — товары v2/v3
- [Яндекс.Маркет API](https://yandex.ru/dev/market/partner-api/doc/ru/) — offer, vendor.model

---

## 9. Рекомендуемые первые шаги

1. Добавить в Product и форму: `brand`, `weight`, `width`, `length`, `height`, `productUrl`.
2. Прогнать тестовую выгрузку на один маркет (например Ozon) и проверить приём карточки.
3. Добавить выбор категории WB (subjectID) и подтягивание обязательных характеристик по API WB.
4. Обновить `product-to-canonical.adapter` и адаптеры маркетов под новые поля.
