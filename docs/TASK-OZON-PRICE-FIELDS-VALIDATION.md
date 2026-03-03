# Задача: Ваша цена, Цена до скидки, валидация перед Ozon

**Формат:** `docs/CURSOR-QODER-PROTOCOL.md`  
**Ветка:** `feat/ozon-price-fields`

---

## Проблема

Ozon требует обязательные поля **«Ваша цена»** и **«Цена до скидки»**. Ошибка: «Цена не попала в допустимые границы для категории товара».

Сейчас:
- В Product нет полей `price` (продажная) и `oldPrice` (до скидки)
- `productToCanonical` хардкодит `price: 1` → Ozon отклоняет
- `validateProductForOzon` не проверяет цену

---

## Требования Ozon (из документации)

- **Минимальная цена:** 20 ₽ для всех категорий
- **При price ≤ 400:** скидка должна быть > 20% (old_price > price / 0.79)
- **Цена до скидки:** должна быть больше «Вашей цены»

---

## Что сделать

### 1. Схема БД (Prisma)

Добавить в `Product`:

```prisma
price       Decimal? @db.Decimal(10, 2)  // Ваша цена (продажная)
oldPrice    Decimal? @map("old_price") @db.Decimal(10, 2)  // Цена до скидки
```

Миграция: `npx prisma migrate dev --name add_product_price_fields`

### 2. productToCanonical

В `apps/api/src/modules/marketplaces/canonical/product-to-canonical.adapter.ts`:

- Вместо `price: 1` использовать `product.price ?? 1` (если price есть в Product)
- Добавить `old_price: product.oldPrice` в CanonicalProduct (тип уже есть)

Нужно добавить `price` и `oldPrice` в тип ProductWithRelations / Product.

### 3. ProductData и canonicalToProductData

- `ProductData` уже имеет `price?: number`
- Добавить `oldPrice?: number` в ProductData (base-marketplace.adapter.ts)
- В `canonicalToProductData` передавать `old_price` из canonical

### 4. Ozon adapter

В `ozon.adapter.ts` при сборке item:
- Использовать `product.oldPrice` если есть, иначе текущая логика (price/0.79 при price≤400)
- Убедиться, что `product.price` передаётся (не хардкод 1)

### 5. validateProductForOzon

В `marketplaces.service.ts` добавить проверки:

- `price` — обязательно, число, >= 20 (минимум Ozon)
- `oldPrice` — если указана, должна быть > price
- При price ≤ 400: oldPrice должна давать скидку > 20% (oldPrice >= ceil(price/0.79))

### 6. API продуктов (create/update)

- Добавить `price` и `oldPrice` в DTO создания/обновления товара
- Сохранять в БД при create/update

### 7. Web (форма товара)

Файлы: `apps/web/app/dashboard/products/new/page.tsx`, `apps/web/app/dashboard/products/[id]/page.tsx`

Добавить поля:
- **Ваша цена, ₽** (обязательное для Ozon, число, >= 20). Отдельно от «Себестоимость» (cost).
- **Цена до скидки, ₽** (опционально; если пусто — считаем при выгрузке: при price≤400 → ceil(price/0.79), иначе price*1.2)

Подсказка: «Ozon: мин. 20 ₽. При цене ≤400 скидка должна быть >20%»

### 8. Модерация

После успешного `v3/product/import` товар автоматически попадает в очередь модерации Ozon. Отдельного API для «отправить на модерацию» нет — это делается при создании. Проверить в ответе `v1/product/import/info` статус (imported/processed).

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `prisma/schema.prisma` | price, oldPrice |
| `product-to-canonical.adapter.ts` | price из product, old_price |
| `canonical-product.types.ts` | old_price уже есть |
| `base-marketplace.adapter.ts` | oldPrice в ProductData |
| `canonicalToProductData` | oldPrice |
| `ozon.adapter.ts` | product.oldPrice при сборке |
| `marketplaces.service.ts` | validateProductForOzon: price, oldPrice |
| DTO products | price, oldPrice |
| Products controller/service | принять price, oldPrice |
| Web: форма товара | поля Ваша цена, Цена до скидки |

---

## Проверка

- `npm run build` — OK
- Нет изменений в `dist/`
- Коммит: `feat(ozon): поля price/oldPrice, валидация перед выгрузкой`

---

## Для Qoder

Прочитай `AGENTS.md` и `docs/DEVELOPER-WORKFLOW.md`. Создай ветку `feat/ozon-price-fields`. Выполни по порядку. После push — отчёт по протоколу.
