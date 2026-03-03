# Задача для Qoder: минимальные цены Ozon

**Формат по протоколу:** `docs/CURSOR-QODER-PROTOCOL.md`

---

## Задача

Учесть минимальные требования Ozon при создании карточки товара. Ozon выдаёт ошибку:

> «Ваша цена не выше 400 — по нашим правилам скидка должна быть больше 20»

То есть при цене ≤ 400 ₽ скидка должна быть **строго больше 20%**.

---

## Контекст

- **Файл:** `apps/api/src/modules/marketplaces/adapters/ozon.adapter.ts`
- **Места с ценами:**
  - Строки 77–78: `buildProductCreatePayload` (canonical → item)
  - Строки 284–292: `buildProductItem` (product → item)
- **Текущая логика:** `old_price = price * 1.2` (ровно 20% скидки) — недостаточно при price ≤ 400

---

## Ожидание

1. При **price ≤ 400** — `old_price` даёт скидку **> 20%** (например, 21%).
2. Формула: `(old_price - price) / old_price > 0.2` → `old_price > price / 0.8`.
3. Рекомендация: `old_price = Math.ceil(price / 0.79)` или `price * 1.27` (округлить вверх).
4. При **price > 400** — можно оставить текущую логику или унифицировать.
5. Учесть оба места: `buildProductCreatePayload` и `buildProductItem`.

---

## Проверка

- `npm run build` — OK
- Нет изменений в `dist/`
- Коммит: `fix(ozon): минимальные цены — скидка >20% при price ≤400`

---

## Для Qoder

Прочитай `AGENTS.md` и `docs/DEVELOPER-WORKFLOW.md`. Создай ветку `fix/ozon-min-prices`, внеси правки, push ветки, `gh pr create`. Отчёт — по формату из `docs/CURSOR-QODER-PROTOCOL.md`.
