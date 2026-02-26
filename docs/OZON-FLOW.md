# Выгрузка товаров на Ozon: цепочка и диагностика

## 1. Подключение Ozon

- **Маркетплейсы** → Подключить Ozon
- Нужны: **Client ID** (числовой) и **API Key** из ЛК seller.ozon.ru → Настройки → API-ключи
- Сохраняются в `MarketplaceConnection` (token = зашифрованный API Key, sellerId = Client ID)
- При connect вызывается `adapter.authenticate()` — проверка через `v1/warehouse/list` или `v2/product/list`

**Проверка:** Маркетплейсы → вкладка «Подключенные» → Ozon → «Проверить подключение»

## 2. Цепочка при «Выгрузить на Ozon»

1. **UI:** POST `/api/marketplaces/sync?marketplace=OZON` с `productIds: [id]`
2. **Controller:** Валидация `validateProductForOzon` (название, артикул, фото URL, цена > 0)
3. **Service:** `syncProducts` → берёт подключение Ozon → `createAdapter('OZON', …)` → `adapter.syncProducts(products)`
4. **OzonAdapter.syncProducts:** для каждого товара без `ozonProductId` вызывает `uploadProduct`
5. **uploadProduct:**
   - Собирает payload: name, offer_id, barcode, price, old_price, images, attributes (9048, 4180), category 17028922/type 91565
   - POST `v3/product/import` → получает task_id
   - Ждёт 2 сек → POST `v1/product/import/info` с task_id
   - Статусы: `imported` / `processed` — успех; `skipped` — уже есть; иначе — ошибка
   - При успехе: `generateBarcodes`, пауза 5 сек, при наличии warehouseId — `setStock` (POST /v2/products/stocks)
6. **Сохранение штрихкода:** после создания маппинга вызывается `saveBarcodeFromMarketplace`:
   - `getBarcodeByProductId` (retry до 3 раз с паузой 3 сек — Ozon возвращает штрихкод с задержкой)
   - Сохранение в `Product.barcodeOzon`

## 3. Преобразование Product → Ozon

- `productToCanonical` → `canonicalToProductData`
- `images` = `[product.imageUrl]` (одно фото)
- `vendorCode` = `article` или `sku`
- `barcode` = `barcodeOzon` или генерируемый EAN-13

## 4. Типичные проблемы

| Симптом | Причина | Решение |
|--------|---------|---------|
| «Ozon не подключён» | Нет записи в MarketplaceConnection | Подключить в Маркетплейсы |
| «Укажите Client ID» | sellerId пустой | Отключить и подключить Ozon заново с Client ID |
| «Неверный API ключ» | Неверный Api-Key или Client-Id | Проверить в ЛК Ozon, переподключить |
| «Ozon не принимает цену 0» | price = 0 | Указать цену > 0 |
| «Добавьте URL фото» | imageUrl пустое или не http | Указать HTTPS-URL изображения |
| «Атрибут не найден» | 4180/9048 не в категории 17028922 | Выбрать категорию через API или использовать другую |
| «Карточка не найдена» | Товар ещё обрабатывается (1–5 мин) | Подождать и нажать «Проверить на Ozon» |

## 5. Остатки (v2/products/stocks)

- **Endpoint:** `POST /v2/products/stocks` (ProductAPI_ProductsStocksV2)
- **Документация:** https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsStocksV2
- **Тело запроса:** `{ stocks: [{ offer_id, product_id, stock, warehouse_id }] }`

**Условия для синхронизации остатков:**
1. Товар должен иметь маппинг (`ProductMarketplaceMapping`): `externalSystemId` = product_id Ozon, `externalArticle` = offer_id.
2. В настройках Ozon (Маркетплейсы → Ozon → Склад) должен быть выбран склад (`warehouse_id`).
3. Маппинг создаётся при выгрузке через HandySeller или при импорте с Ozon.

**Если товар создан вручную на Ozon:** маппинга нет → остатки не синхронизируются. Решение: «Загрузить с Ozon» или связать товар вручную.

## 6. API для диагностики

- `GET /api/marketplaces/ozon-test` — проверка подключения (Client-Id, API, auth)
- `GET /api/marketplaces/ozon-validate/:productId` — проверка полей товара
- `GET /api/marketplaces/ozon-check/:productId` — есть ли карточка на Ozon
- `GET /api/marketplaces/ozon-stock/:article` — статус остатков: localStock, ozonProductId, offer_id, warehouseId, warehouseConfigured, error
- `POST /api/marketplaces/ozon-stock/:article/sync` — принудительная синхронизация остатков
- `GET /api/marketplaces/ozon-debug/:productId` — сравнение offer_id (для уже выгруженных)
- `GET /api/marketplaces/ozon-export-preview/:productId` — предпросмотр payload без отправки
- `POST /api/marketplaces/ozon-export-diagnostic/:productId` — попытка выгрузки с полным ответом Ozon при ошибке

## 7. Если карточка не выгружается

1. **Проверьте обязательные поля:** название, артикул, фото (URL), цена > 0, вес, ширина, длина, высота.
2. **Нажмите «Предпросмотр выгрузки»** — посмотрите, что уйдёт на Ozon и какие атрибуты требуются.
3. **Нажмите «Диагностика выгрузки»** — выполняется реальная попытка импорта. При ошибке показывается полный ответ Ozon (status, items[].errors). По нему можно понять причину (категория, атрибуты, формат данных).
4. **Категория и тип:** по умолчанию 17028922/91565. Если Ozon отклоняет — выберите категорию через API или укажите ozonCategoryId/ozonTypeId в карточке.
5. **ID склада:** укажите в Маркетплейсы → Ozon → «Загрузить склады» → выбрать по названию.
