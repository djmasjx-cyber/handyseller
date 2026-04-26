# Инструкция для AI-агентов (Cursor, Qoder)

**Проект:** HandySeller — маркетплейс-агрегатор (WB, Ozon, Яндекс, Avito).

---

## Роли

| Агент | Роль | Зона ответственности |
|-------|------|----------------------|
| **Cursor** | Ведущий разработчик | Ревью, merge в main, push main, контроль деплоя |
| **Qoder** | Разработчик | Ветка, код, коммит, push ветки, PR |

**Критично:** Qoder не пушит в `main`. Только Cursor.

### Текущий фокус продукта

- **WMS** — основной приоритет: склад, накладные, приёмка, штрихкоды, операции кладовщика (`apps/web` WMS, BFF `app/api/wms`, `wms-api`, пакеты `wms-*`).
- **TMS и заказы у перевозчиков** — контур **считаем стабильным и закрытым**; не предлагать доработки по перевозчикам, не плодить интеграции и тестовые сценарии с нуля, **если пользователь явно не попросил**. Не отвлекать обсуждение WMS на TMS.

### WMS и поставка (dev → prod)

- **Контур:** правки WMS (web, BFF, `wms-api`, пакеты `wms-*`) вливаем в ветку **`dev`** → GitHub **Deploy Staging** → проверка на **`https://dev.handyseller.ru`**. На **production** (`https://app.handyseller.ru`) — только после вашего **апрува** и merge в **`main`** (workflow **Deploy Production**). Подробности: `docs/CI-DEPLOY.md`.
- **Ветки WMS:** ориентир — **`dev`** (`git pull origin dev`). Старые длинные ветки с несмёрженным бэкендом держим как **архив на GitHub** (например `origin/feat/wms-invoice-vgh`); новая задача — **ветка от свежего `dev`**, без раздувания старых `feat/*` без rebase/merge.

- **Ветки WMS (чтобы не путать репозиторий):** единый ориентир для выкатки в staging — **`dev`** (`git checkout dev && git pull origin dev`). Старую длинную ветку с несмёрженным бэкендом **не удаляем с GitHub** — она остаётся **архивом** (например `origin/feat/wms-invoice-vgh`); от неё **не** продолжают разработку без `merge` или `rebase` на актуальный `dev`, иначе снова будут конфликты. Новая задача — **новая ветка от свежего `dev`**, один PR в `dev` (как с UI WMS в PR #46).

### Когда владелец = только пользователь (без кода)

- **Агент (Cursor):** пишет и правит код, гоняет `lint`/`build` и нужные тесты, готовит описание PR и список «что кликнуть на dev», при необходимости подсказывает точные git-команды. **Пуш, merge в GitHub и слежение за Actions** — на стороне владельца или назначенного human-оператора, если среда агента к репо не подключена.
- **Пользователь:** смотрит результат на **dev**, пишет замечания или **«в прод / ок»** — дальше merge в `main` и ожидаемый выкат по вашему процессу.

---

## Правила (соблюдать всегда)

1. **Не трогать `dist/`** — скомпилированный вывод. Менять только `src/`, `prisma/`, `docs/`.
2. **Push в main** — только Cursor, только по явной просьбе пользователя.
3. **SSH для push:** `GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_github -o IdentitiesOnly=yes" git push origin <ветка>`
4. **Выгрузка карточек на WB** — не менять. `wildberries.adapter.ts` (convertToPlatform, tryUploadWithFullResponse, uploadFromCanonical) — формат проверен, работает. Подробнее: `docs/CURSOR-QODER-PROTOCOL.md`.

---

## Документация

| Файл | Назначение |
|------|------------|
| `docs/DEVELOPER-WORKFLOW.md` | Полный workflow, роли, команды |
| `docs/QODER-DEV-WORKFLOW.md` | **Dev-режим на сервере — обязательно для Qoder** |
| `docs/CURSOR-QODER-PROTOCOL.md` | Формат задач, отчётов, чеклисты |
| `docs/ARCHITECTURE.md` | Архитектура проекта |
| `scripts/install-git-hooks.sh` | Pre-commit: блокировка dist/ |
| `.github/PULL_REQUEST_TEMPLATE.md` | Шаблон PR |

---

## Точка входа для Qoder

1. **При старте задачи:** прочитай `docs/DEVELOPER-WORKFLOW.md` и `docs/CURSOR-QODER-PROTOCOL.md`. Следуй разделу «Роль Qoder».
2. **При разработке на сервере:** прочитай `docs/QODER-DEV-WORKFLOW.md`. Используй `npm run dev:parallel` / `npm run dev:parallel:stop`, проверяй на http://dev.handyseller.ru, коммить и пушить только после проверки.
3. **После PR:** сообщи пользователю, что готово к merge.
