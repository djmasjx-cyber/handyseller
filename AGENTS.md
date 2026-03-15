# Инструкция для AI-агентов (Cursor, Qoder)

**Проект:** HandySeller — маркетплейс-агрегатор (WB, Ozon, Яндекс, Avito).

---

## Роли

| Агент | Роль | Зона ответственности |
|-------|------|----------------------|
| **Cursor** | Ведущий разработчик | Ревью, merge в main, push main, контроль деплоя |
| **Qoder** | Разработчик | Ветка, код, коммит, push ветки, PR |

**Критично:** Qoder не пушит в `main`. Только Cursor.

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
