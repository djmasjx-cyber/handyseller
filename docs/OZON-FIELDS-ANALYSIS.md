# Анализ полей Ozon ↔ HandySeller

> Цель: обеспечить успешное создание карточек товаров на Ozon из приложения HandySeller. Выявить несоответствия и отсутствующие поля.

## 1. Требования Ozon API v3 Product Import

Ozon использует **POST /v3/product/import** с полями:

| Поле Ozon | Обязательность | Описание |
|-----------|----------------|----------|
| **name** | ✓ | Название товара |
| **offer_id** | ✓ | Артикул продавца (уникальный) |
| **barcode** | ✓ | Штрих-код (EAN-13 или OZ-формат) |
| **price** | ✓ | Цена продажи |
| **old_price** | ✓ | Старая цена (для скидки) |
| **description_category_id** | ✓ | ID категории из справочника Ozon |
| **type_id** | ✓ | ID типа товара (должен быть > 0) |
| **images** | ✓ | Массив URL изображений (≥1) |
| **height, width, depth** | ✓ | Габариты в мм |
| **weight** | ✓ | Вес в граммах |
| **vat** | ✓ | НДС (обычно '0') |
| **attributes** | ✓ | Массив атрибутов по категории |
| **description** | рекомендуемо | Текстовое описание |

---

## 2. Маппинг HandySeller → Ozon (текущий)

| Поле Ozon | Поле HandySeller | Обязательность | Цепочка |
|-----------|------------------|----------------|---------|
| **name** | `title` | ✓ | Product.title → canonical.title → ProductData.name |
| **offer_id** | `article` или `sku` | ✓ | article → vendor_code → vendorCode (санитизация) |
| **barcode** | `barcodeOzon` или генерация | ✓ | barcodeOzon → barcode или EAN-13 |
| **price** | `price` | ✓ | price → price |
| **old_price** | — | ✓ | price * 1.25 (авто) |
| **images** | `imageUrl` | ✓ | imageUrl → images[url] |
| **height** | `height` | ✓ | height → height_mm → height (fallback 100) |
| **width** | `width` | ✓ | width → width_mm → width (fallback 100) |
| **depth** | `length` | ✓ | length → length_mm → length (fallback 100) |
| **weight** | `weight` | ✓ | weight → weight_grams → weight (fallback 100) |
| **vat** | — | ✓ | '0' |
| **description_category_id** | `ozonCategoryId` или 17028922 | ✓ | ozonCategoryId ?? 17028922 |
| **type_id** | `ozonTypeId` или 91565 | ✓ | ozonTypeId ?? 91565 |
| **attributes[9048]** | `name` (Название модели) | ✓ | name / offerId |
| **attributes[4180]** | `brand` (Бренд) | ✓ | brand ?? «Ручная работа» |
| **description** | `description` + `richContent` + color, material и др. | рекомендуемо | description, richContent, color, material... |

### Дополнительные поля в description (текущая логика)
Цвет, кол-во в упаковке, материал, вид творчества, страна, комплектация — добавляются в текст `description`, но **не как атрибуты Ozon**.

---

## 3. Выявленные проблемы

### 3.1 Категория и тип — захардкожены

```ts
// ozon.adapter.ts, строка 182–183
description_category_id: 17028922,
type_id: 91565,
```

**Проблема:**
- Каждый товар на Ozon привязан к категории и типу.
- `17028922` и `91565` — константы для одной конкретной категории.
- У handmade-товаров может быть разная категория: «Декор», «Украшения», «Свечи», «Текстиль» и т.п.
- Неподходящая категория/тип → ошибка модерации или отклонение карточки.

**Решение:** добавить поля `ozonCategoryId` и `ozonTypeId` в Product, с выбором при создании товара (или выбором категории из справочника Ozon).

---

### 3.2 Атрибуты — только «Название модели»

Сейчас передаётся только атрибут 9048 (Название модели):

```ts
attributes: [
  { id: 9048, complex_id: 0, values: [{ dictionary_value_id: 0, value: modelName }] },
],
```

**Проблема:**
- У каждой категории Ozon свои **обязательные** атрибуты (через `/v1/description-category/attribute`).
- Часто требуются: Бренд, Аннотация, Цвет (из справочника), Страна производства и др.
- Без заполнения обязательных атрибутов карточка не пройдёт модерацию.

**Решение:** получать список обязательных атрибутов по `description_category_id` и `type_id`, заполнять их из наших полей или давать пользователю вводить/выбирать.

---

### 3.3 Бренд не передаётся как атрибут

| HandySeller | Ozon |
|-------------|------|
| `brand` | ❌ Не используется в attributes |

**Проблема:** Ozon часто требует атрибут «Бренд». Мы храним `brand`, но в Ozon уходит только в текст `description` (если добавляется), не в `attributes`.

**Решение:** добавить в attributes атрибут «Бренд» (ID из справочника категории), использовать `brand` или «Ручная работа» / «Нет бренда».

---

### 3.4 Цвет, страна и др. — в description, не в attributes

| HandySeller | Ozon | Текущее |
|-------------|------|---------|
| `color` | Атрибут «Цвет» (справочник) | Текст в description |
| `countryOfOrigin` | Атрибут «Страна» | Текст в description |
| `material` | Атрибут «Материал» | Текст в description |

**Проблема:** для корректной выдачи и фильтрации Ozon ожидает эти данные в `attributes` со значениями из справочников. Только текст в description — менее желательно.

**Решение:** по возможности использовать справочники Ozon (цвета, страны, материалы) и передавать значения через `attributes` с `dictionary_value_id` или `value`.

---

### 3.5 Один URL изображения

| HandySeller | Ozon |
|-------------|------|
| `imageUrl` (одно) | `images` (массив, рекомендуется 5–10) |

**Проблема:** Ozon рекомендует несколько фото. Один URL технически допустим, но для качества карточки лучше несколько.

**Решение:** добавить `images[]` в Product, поддержать несколько фото.

---

### 3.6 productUrl

| HandySeller | Ozon |
|-------------|------|
| `productUrl` | Не требуется |

На Ozon поле URL страницы товара не обязательно. Для HandySeller это нужно в основном для Яндекс.Маркета.

---

## 4. Сводная таблица: что есть / чего не хватает

| Поле / требование | HandySeller | Ozon | Действие |
|-------------------|-------------|------|----------|
| Название | ✓ title | ✓ name | OK |
| Артикул | ✓ article | ✓ offer_id | OK |
| Штрих-код | ✓ barcodeOzon | ✓ barcode | OK (или генерация) |
| Цена | ✓ price | ✓ price | OK |
| Изображения | 1 (imageUrl) | ≥1 | Рекомендуется массив images |
| Габариты | ✓ weight, width, length, height | ✓ weight, height, width, depth | OK |
| Описание | ✓ description, richContent | ✓ description | OK |
| Категория Ozon | ❌ | ✓ description_category_id | **Добавить ozonCategoryId** |
| Тип Ozon | ❌ | ✓ type_id | **Добавить ozonTypeId** |
| Атрибуты по категории | Частично (только 9048) | ✓ attributes | **Доработать attributes** |
| Бренд как атрибут | ✓ brand | Часто обяз. | **Передавать в attributes** |
| Цвет как атрибут | ✓ color | Рекоменд. | Маппинг в справочник |
| Страна как атрибут | ✓ countryOfOrigin | Рекоменд. | Маппинг в справочник |
| Материал как атрибут | ✓ material | Рекоменд. | Маппинг или value |

---

## 5. Рекомендуемые шаги

### Фаза 1 — Минимум для прохода модерации
1. Проверить, подходят ли `17028922` и `91565` для целевой категории (handmade).
2. Добавить передачу `brand` в attributes (атрибут «Бренд» по ID из справочника категории).
3. Убедиться, что все обязательные атрибуты выбранной категории заполняются.

### Фаза 2 — Корректная категоризация
4. Добавить в Product поля `ozonCategoryId`, `ozonTypeId`.
5. Реализовать выбор категории при создании/редактировании товара (дерево категорий Ozon).
6. Загружать обязательные атрибуты по выбранной категории через `/v1/description-category/attribute`.

### Фаза 3 — Улучшения
7. Массив изображений `images[]` вместо одного `imageUrl`.
8. Маппинг цвета, страны, материала в справочники Ozon.
9. Предзаполнение атрибутов из WB при импорте.

---

## 6. API Ozon для реализации

| Метод | Назначение |
|-------|------------|
| `GET /v1/description-category/tree` | Дерево категорий (description_category_id, type_id) |
| `POST /v1/description-category/attribute` | Атрибуты категории (description_category_id, type_id) |
| `POST /v3/product/import` | Создание/обновление товара |

---

## 7. Текущий код (фрагменты)

**Ozon uploadProduct** (`ozon.adapter.ts:182-201`):
- description_category_id: 17028922
- type_id: 91565
- attributes: только id 9048

**Product → ProductData** (через canonical):
- Все поля Product уже маппятся в canonical и ProductData.
- Проблема не в отсутствии полей в модели, а в том, что Ozon-адаптер не использует их полностью и опирается на захардкоженную категорию.
