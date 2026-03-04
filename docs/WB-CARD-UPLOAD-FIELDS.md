# Маппинг полей HandySeller → Wildberries при выгрузке карточки

## Два поля цен — какое передаётся на WB

| Наше поле | В интерфейсе | Передаётся на WB? | Куда |
|-----------|--------------|-------------------|------|
| **cost** | Себестоимость (₽) | ❌ Нет | Только для аналитики |
| **price** | Ваша цена, ₽ * | ✅ Да | `goods[0].sizes[0].price` |
| **oldPrice** | Цена до скидки, ₽ | ❌ Нет | Используется только для Ozon |

**На WB уходит только «Ваша цена» (price).** Себестоимость и цена до скидки на WB не передаются.

## Полная таблица соответствия полей

| Наше поле (Product) | В интерфейсе | Поле WB | Путь в JSON |
|---------------------|--------------|---------|--------------|
| title | Название * | Наименование | card.goods[0].characteristics (charcID из API) |
| article | Артикул * | supplierVendorCode, vendorCode | card.supplierVendorCode, good.vendorCode |
| description | Описание | Описание | characteristics (charcID) |
| **price** | **Ваша цена, ₽ *** | price | good.sizes[0].price |
| imageUrl | Фото (URL) | Фото | good.addin[] type «Фото» |
| wbSubjectId | Категория WB | subjectId | card.subjectId |
| brand | Бренд | brand | card.brand (дефолт «Ручная работа») |
| weight | Вес (г) | weightBrutto | card.dimensions, good.weightBrutto |
| width | Ширина (мм) | width | card.dimensions, good (см) |
| length | Длина (мм) | length | card.dimensions, good (см) |
| height | Высота (мм) | height | card.dimensions, good (см) |
| color | Цвет | Цвет | characteristics |
| material | Материал | Материал изделия | characteristics |
| craftType | Вид творчества | Вид творчества | characteristics |
| countryOfOrigin | Страна | countryProduction | card.countryProduction |
| itemsPerPack | Кол-во в упаковке | Количество предметов | characteristics |
| packageContents | Комплектация | Комплектация | characteristics |
| — | — | barcode | Генерируется WB API |
| — | — | skus | good.sizes[0].skus = [barcode] |

## Цепочка преобразования

```
Product (БД) → productToCanonical() → CanonicalProduct → convertToPlatform() → WB JSON
```

- `productToCanonical`: берёт `product.price` (НЕ cost), `product.wbSubjectId`, `product.article` и т.д.
- `convertToPlatform`: формирует `{ cards: [card] }` для POST /content/v2/cards/upload

## Как проверить

1. **Валидация:** `GET /api/marketplaces/wb-validate/:productId` — проверка обязательных полей.
2. **Предпросмотр:** `GET /api/marketplaces/wb-export-preview/:productId` — что именно уйдёт на WB (payload, маппинг).

## Валидация перед выгрузкой

Перед выгрузкой на WB проверяются обязательные поля (`validateProductForWb`):

- **Название** (title)
- **Артикул** (article / vendor code)
- **Категория WB** (wbSubjectId) — выбор из справочника
- **Фото** (imageUrl) — URL изображения
- **Ваша цена** (price) — > 0

При отсутствии полей выгрузка блокируется с понятным сообщением.

## Обязательные поля WB (по документации)

| Поле WB | Обязательно | Наш маппинг | Статус |
|---------|-------------|-------------|--------|
| **subjectId** | ✓ | wbSubjectId (выбор категории) | ✓ |
| **vendorCode** / supplierVendorCode | ✓ | article / vendor_code | ✓ |
| **brand** | ✓ | brand_name (дефолт «Ручная работа») | ✓ |
| **Наименование** (characteristics) | ✓ | title | ✓ |
| **Описание** (characteristics) | ✓ | description | ✓ |
| **characteristics** | ✓ (по категории) | charcID из API charcs | ✓ исправлено |
| **dimensions** (width, height, length, weightBrutto) | ✓ | weight, width, length, height | ✓ |
| **sizes** (techSize, wbSize, skus) | ✓ | Добавлено при наличии barcode | ✓ исправлено |
| **barcode** | ✓ | Генерация через POST /content/v2/barcodes | ✓ |
| **images** (Фото в addin) | ✓ | images[] → addin type «Фото» | ✓ |

## Изменения (исправление передачи карточки)

### 1. Характеристики по категории (charcs)

- **Проблема:** Использовались фиксированные ID (0, 1, 3, 4…) — они не подходят для всех категорий WB.
- **Решение:** Добавлен `getCharcsForSubject(subjectId)` — запрос `GET /content/v2/object/charcs/{subjectId}`.
- Маппинг наших полей на charcID по имени: Наименование, Описание, Цвет, Материал и т.д.
- Обязательные характеристики без значения заполняются «Не указано».

### 2. Sizes с штрих-кодом

- **Проблема:** WB требует `sizes[].skus` для идентификации размера.
- **Решение:** При наличии barcode добавляется:
  ```json
  "sizes": [{ "techSize": "Без размера", "wbSize": "RU", "price": N, "skus": [barcode] }]
  ```

### 3. Дефолты для обязательных полей

- Описание: при пустом — «Описание товара».
- Наименование: при пустом — «Товар».

## Источники

- [WB Content API](https://dev.wildberries.ru/docs/openapi/work-with-products)
- [Выгрузка карточек на WB через API (Habr)](https://habr.com/ru/articles/897548/)
- `GET /content/v2/object/charcs/{subjectId}` — характеристики категории
