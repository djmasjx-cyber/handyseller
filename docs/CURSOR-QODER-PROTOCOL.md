# Протокол передачи Cursor ↔ Qoder

Системный регламент взаимодействия между агентами.

---

## 1. Формат задачи для Qoder

Пользователь или Cursor передаёт задачу в виде:

```
Задача: [краткое описание]
Контекст: [опционально — файлы, ссылки]
Ожидание: [что должно получиться]
```

**Пример:**
```
Задача: убрать вызов устаревшего API /v1/barcode/generate из Ozon
Контекст: ozon.adapter.ts, docs/OZON-BARCODE-FIX-REPORT.md
Ожидание: штрих-коды получаются через /v3/product/import, без generateBarcodes
```

---

## 2. Что делает Qoder

1. Читает `docs/DEVELOPER-WORKFLOW.md`
2. Создаёт ветку `fix/` или `feat/`
3. Вносит изменения только в `src/`, `prisma/`, `docs/`
4. Проверяет: `npm run build`
5. Коммит: `type(scope): описание`
6. Push ветки с `GIT_SSH_COMMAND`
7. `gh pr create`
8. Отдаёт отчёт (см. ниже)

---

## 3. Отчёт Qoder после завершения

Строгий формат. Копировать и заполнить:

```
## Готово к merge

**Ветка:** fix/имя-ветки
**Коммит:** abc1234 type(scope): описание
**PR:** https://github.com/djmasjx-cyber/handyseller/pull/N

**Изменённые файлы:**
- path/to/file.ts
- path/to/file2.ts

**Проверка:** npm run build — OK
**dist/ в коммите:** нет

Cursor: можно мержить.
```

---

## 4. Чеклист Cursor перед merge

- [ ] В коммите нет файлов из `dist/`
- [ ] Изменения только в `src/`, `prisma/`, `docs/`
- [ ] `npm run build` проходит (или проверено в CI)
- [ ] Пользователь одобрил merge (если не было явной просьбы)

**Команды:**
```bash
git checkout main
git pull origin main
git merge fix/имя-ветки
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_github -o IdentitiesOnly=yes" git push origin main
```

---

## 5. Эскалация

Если Qoder не может выполнить (нет `gh`, ошибка push, конфликт):
- Сообщить пользователю с точным текстом ошибки
- Не пытаться обойти ограничения (API, токены)
- Cursor может выполнить push при необходимости
