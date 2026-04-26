# Инструкция для Qoder: Dev-режим на сервере

**Ознакомься с этим документом и действуй по этой схеме при разработке.**

---

## Схема работы

Разработка ведётся **на сервере** через Cursor Remote-SSH. **Публичный** dev — `https://dev.handyseller.ru`: после merge в `dev` туда катается **отдельный** Docker-стэк (staging, порты 4010/3010, см. `docs/DEV-PROD-STACK.md`). **Prod** остаётся на `app.handyseller.ru` до merge в `main`. PM2 (`dev:parallel`, порты 4001/3002) — вспомогательный **локальный** режим кода, не путать с публичным dev-URL.

**Важно:** метод взаимодействия (dev-parallel, порты 4001/3002, nginx) не менять — схема работает.

**Dev через PM2:** авторестарт при падении, Node 20 (исправляет crypto/nest-schedule). Prod (Docker) не затрагивается.

---

## Цикл разработки

### 1. Запуск dev

```bash
cd /home/ubuntu/handyseller-repo
npm run dev:parallel
```

Что происходит:
- PM2 запускает dev API (4001) и dev Web (3002) **параллельно с prod**
- При падении процесса PM2 перезапускает его
- Prod (app.handyseller.ru) продолжает работать
- Dev доступен по **http://dev.handyseller.ru**

### 2. Разработка

- Редактируй код в Cursor
- Сохраняй — изменения подхватываются автоматически (watch mode)
- **Проверяй на dev:** http://dev.handyseller.ru
- Логи: `/tmp/handyseller-dev-api.log`, `/tmp/handyseller-dev-web.log`

### 3. Когда готово — коммит и пуш

```bash
git add .
git commit -m "fix(scope): описание"
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_github -o IdentitiesOnly=yes" git push -u origin fix/имя-ветки
```

(Не пушить в main — только в свою ветку, затем PR.)

### 4. Остановка dev (по желанию)

```bash
npm run dev:parallel:stop
```

Prod при этом не затрагивается.

### 5. После перезагрузки VM

Prod (Docker) поднимается автоматически через systemd. Dev — вручную:

```bash
cd /home/ubuntu/handyseller-repo
npm run dev:parallel
```

---

## Важно

| Правило | Пояснение |
|---------|-----------|
| **Не коммитить без проверки** | Сначала убедись, что всё работает на dev.handyseller.ru |
| **Не патчить dist/** | Менять только `apps/api/src/`, `apps/web/`, `prisma/` |
| **Не менять dev-схему** | Скрипты dev-parallel, nginx, порты 4001/3002 — не трогать |
| **Одна БД** | Dev использует ту же БД, что и prod. Осторожно с тестами |

---

## Команды — шпаргалка

```bash
# Запуск dev (параллельно с prod)
npm run dev:parallel

# Остановка dev
npm run dev:parallel:stop

# Статус PM2
npm run dev:status
# или: npx pm2 status

# Логи dev API
tail -f /tmp/handyseller-dev-api.log

# Логи dev Web
tail -f /tmp/handyseller-dev-web.log
```

---

## Порты и окружения

| Окружение | API (host) | Web (host) | URL |
|-----------|------------|------------|-----|
| **Prod (Docker)** | 4000 | 3001 | https://app.handyseller.ru |
| **Staging (Docker, публичный dev)** | 4010 | 3010 | https://dev.handyseller.ru |
| **PM2 dev:parallel (локально)** | 4001 | 3002 | не по умолчанию в Nginx; при необходимости — прямой localhost |

Nginx для `dev.handyseller.ru` смотрит на **4010/3010** (см. `DEV-PROD-STACK.md`).

---

## Если что-то пошло не так

- **Порты dev заняты:** `npm run dev:parallel:stop`, затем `npm run dev:parallel`
- **Dev API не стартует:** проверь `apps/api/.env`, DATABASE_URL, REDIS_HOST=127.0.0.1
- **PM2 crash-loop:** `npx pm2 logs handyseller-dev-api` — смотри причину падения
- **Prod** — отдельно, через Docker в `/opt/handyseller`. Dev его не затрагивает.
