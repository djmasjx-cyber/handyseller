# Маппинг полей HandySeller → Wildberries при выгрузке карточки

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
