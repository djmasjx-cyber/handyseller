# Цепочка данных: связки товаров и аналитика

Документ для пошаговой проверки: откуда берутся связки, как они попадают в БД и как выводятся на вкладках «Товары» и «Аналитика».

---

## 1. Источник истины — БД

### Таблица `ProductMarketplaceMapping`

| Поле | Описание |
|------|----------|
| productId | Наш внутренний Product.id |
| userId | Владелец связки (user или linkedToUserId) |
| marketplace | WILDBERRIES, OZON, YANDEX, AVITO |
| externalSystemId | nm_id (WB), product_id (Ozon), ASIN |
| isActive | Активна ли связка |

**Индексы:** `(userId, marketplace)`, `(productId)` — запросы по связкам быстрые.

### Legacy: `Product.sku`

- WB: `sku = WB-{userId8}-{nmId}` (например `WB-abc12345-12345678`)
- Используется, если нет записи в ProductMarketplaceMapping
- Миграция `20250217000000` перенесла часть WB-sku в маппинги

### Дополнительный источник: заказы

- `Order.marketplace` + `OrderItem.productId` — товары, по которым есть заказы, считаются «на площадке»

---

## 2. Вкладка «Товары» — пошагово

| Шаг | Компонент | Действие |
|-----|-----------|----------|
| 1 | `GET /api/products` (Next.js) | Проксирует на `API_BASE/products` |
| 2 | NestJS `ProductsController` → `ProductsService.findAll()` | `Product.findMany` с `include: { marketplaceMappings: { where: { isActive: true } } }` |
| 3 | Ответ | Массив `{ id, title, ..., marketplaceMappings: [{ marketplace, externalSystemId }] }` |
| 4 | `products/page.tsx` | `linkedMarketplaces = mappings.length > 0 ? mappings.map(m => m.marketplace) : (sku?.startsWith("WB-") ? ["WILDBERRIES"] : ...)` |
| 5 | UI | Бейджи WB, OZ, Я, AV в колонке «Площадки» |

**Вывод:** Связки берутся из `ProductMarketplaceMapping` (через `Product.marketplaceMappings`) и fallback на `Product.sku` (WB-, OZ-, YM-, AV-).

---

## 3. Вкладка «Аналитика» — пошагово

**Важно:** В проде nginx направляет все `/api/*` в NestJS. Поэтому `/api/dashboard` обрабатывает **NestJS DashboardService**, а не Next.js route.

| Шаг | Компонент | Действие |
|-----|-----------|----------|
| 1 | Браузер → `GET /api/dashboard` | nginx proxy_pass → NestJS :4000 |
| 2 | NestJS `DashboardController` → `DashboardService.getDashboard()` | Вызывает `getLinkedProductsStats()` и `getStatistics()` |
| 3 | Ответ | `{ summary: { totalProductsOnMarketplaces, ... }, statistics: { wildberries: { revenue, totalOrders, linkedProductsCount }, ... }, orders }` |
| 4 | `getLinkedProductsStats()` | 3 запроса к БД: ProductMarketplaceMapping, Product (legacy sku), OrderItem+Order |
| 5 | `getStatistics()` | Адаптеры WB/Ozon (выручка, заказы) + linkedProductsCount из БД |
| 6 | `analytics/page.tsx` | Карточка «Товары на площадках» = `s.totalProductsOnMarketplaces`, блок «По площадкам» = `stat.linkedProductsCount` |

**Вывод:** Аналитика использует тот же источник — `ProductMarketplaceMapping` + legacy sku + заказы. Отдельный эндпоинт, без внешних API.

---

## 4. Согласованность «Товары» и «Аналитика»

| Аспект | Товары | Аналитика |
|--------|--------|-----------|
| ProductMarketplaceMapping | ✅ через Product.include | ✅ прямой запрос |
| Legacy sku WB | `sku.startsWith("WB-")` | `^WB-[^-]+-[0-9]+$` + fallback OZ-/YM-/AV- |
| Legacy sku OZ/YM/AV | `sku.startsWith("OZ-")` и т.д. | ✅ `OZ-`, `YM-`, `AV-` (с v2) |
| Заказы | ❌ | ✅ OrderItem + Order |

**С версии с выравниванием:** Аналитика учитывает те же legacy-паттерны, что и вкладка «Товары» (WB, OZ-, YM-, AV-), плюс товары из заказов.

---

## 5. Нужна ли отдельная БД для аналитики?

**Нет.** Текущая схема достаточна:

- Связки хранятся в `ProductMarketplaceMapping` — одна таблица, один источник истины
- Запросы `getLinkedProductsStats` — 3 простых запроса с индексами, время выполнения обычно < 50 ms
- Отдельная БД добавляет сложность (репликация, две точки отказа) без явной выгоды на текущих объёмах

**Когда имеет смысл оптимизация:**

- При > 10 000 товаров и > 100 пользователей — можно добавить **денормализованную таблицу** в той же БД:
  - `UserMarketplaceProductStats(userId, marketplace, linkedCount, updatedAt)`
  - Обновление: по событию (mapping создан/удалён) или по крону раз в 5–10 минут

---

## 6. Проверка в проде

### Цепочка запросов (nginx → NestJS)

```
Браузер → nginx:3000 → /api/* → NestJS:4000
                      /     → Next.js:3001 (страницы)
```

### Шаги проверки

1. **Главная:** `/dashboard` — «Активные товары» = `totalProducts` (товары с остатком > 0). Источник: NestJS `/api/dashboard`.
2. **Товары:** `/dashboard/products` — бейджи WB/OZ у товаров с маппингами. Источник: NestJS `/api/products`.
3. **Аналитика:** `/dashboard/analytics` — «Товары на площадках» = `totalProductsOnMarketplaces`, блок «По площадкам» = `statistics`. Источник: NestJS `/api/dashboard` (с февраля 2025 включает `getLinkedProductsStats` + `getStatistics`).

### Диагностика при «Товары на площадках» = 0

1. DevTools → Network → запрос `/api/dashboard` → проверить, что в ответе есть `summary.totalProductsOnMarketplaces` и `statistics`.
2. Логи API на VM: `pm2 logs handyseller-api` или `tail -f /tmp/handyseller-api.log`.
3. Прямой вызов: `curl -H "Authorization: Bearer TOKEN" https://app.handyseller.ru/api/dashboard` — проверить JSON.
