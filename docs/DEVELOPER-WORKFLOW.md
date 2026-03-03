# Инструкция для разработчиков (Qoder и команда)

**Точка входа для агентов:** `AGENTS.md` в корне репо.

---

## Вертикаль разработки

| Роль | Кто | Ответственность |
|------|-----|-----------------|
| **Главный разработчик** | Cursor AI | Ревью, merge в main, push в main, деплой |
| **Команда** | Qoder | Правки, коммиты, push ветки в GH, создание PR |

**Правило:** Qoder **не пушит** в `main`. Только Cursor. Qoder делает ветку → push ветки → PR. Cursor мержит и пушит в main.

---

## Workflow: Qoder → Cursor → main

```
Qoder: ветка → код → коммит → push ветки → gh pr create
                    ↓
Cursor: проверка → merge → push main → деплой
```

---

## ⛔ Не делать

- **Qoder: не пушить в `main`** — это делает только Cursor. Push только в свою ветку.
- **Не патчить `dist/`** — при сборке через GH всё перезапишется. Менять только исходники (`src/`).
- **Не мержить без Cursor** — merge в main выполняет Cursor.

---

## Роль Qoder: ветка → GH → PR

### 1. Ветка

```bash
git checkout main
git pull origin main
git checkout -b fix/краткое-описание   # или feat/, refactor/
```

### 2. Изменения

- Редактировать только файлы в `apps/api/src/`, `apps/web/`, `prisma/`, `docs/` — никогда `dist/`
- Перед коммитом: `npm run build` — убедиться, что собирается

### 3. Коммит

Формат: `type(scope): краткое описание`

```
feat(orders): бейдж FBO в столбце Источник
fix(ozon): штрих-код — retry 6 попыток
```

Типы: `feat`, `fix`, `refactor`, `ci`, `docs`, `chore`

### 4. Push ветки (не main!)

```bash
git add .
git commit -m "fix(scope): описание"
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_github -o IdentitiesOnly=yes" git push -u origin fix/краткое-описание
```

### 5. Создание PR

```bash
gh pr create --base main --head fix/краткое-описание --title "fix(scope): описание" --body "Описание изменений"
```

**На этом всё.** Дальше — Cursor. Не мержить, не пушить в main.

---

## Роль Cursor: ревью → merge → push main

1. Проверить изменения (код, что нет правок в `dist/`)
2. `git checkout main && git merge fix/имя-ветки`
3. `GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_github -o IdentitiesOnly=yes" git push origin main`
4. Деплой запустится автоматически (GitHub Actions)

---

## Push в GitHub (SSH-ключ)

Обычный `git push` даёт `Permission denied`. Всегда:

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_github -o IdentitiesOnly=yes" git push origin <ветка>
```

Ключ: `~/.ssh/id_ed25519_github`

---

## Для Qoder: кратко

**Твоя зона:** ветка, код, коммит, push ветки, `gh pr create`.  
**Не твоя зона:** push в main, merge в main. Это делает Cursor.

**Почему не трогать `dist/`:**  
`dist/` — скомпилированный код. При деплое GitHub Actions перезапишет его. Меняй только `src/*.ts`.

**Push ветки — один раз:**  
```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_github -o IdentitiesOnly=yes" git push -u origin fix/имя-ветки
```  
Не гонять `git fetch`, `git branch -vv` для проверки. Если в выводе `fix/xxx -> fix/xxx` — push прошёл.

**Создание PR:**  
```bash
gh pr create --base main --head fix/имя-ветки --title "fix(scope): описание" --body "Описание"
```

После PR — сообщи пользователю. Cursor сделает merge и push в main.

---

## Первоначальная настройка (один раз)

```bash
bash scripts/install-git-hooks.sh
```

Устанавливает pre-commit hook: блокирует коммит файлов из `dist/`.

---

## Полезные ссылки

- Точка входа для агентов: `AGENTS.md`
- Протокол Cursor ↔ Qoder: `docs/CURSOR-QODER-PROTOCOL.md`
- Деплой: `.github/workflows/deploy.yml`
- Ozon штрих-коды: `docs/OZON-BARCODE-FIX-REPORT.md`
- Архитектура: `docs/ARCHITECTURE.md`
