# Инструкция для Qoder: Dev-режим на сервере

**Ознакомься с этим документом и действуй по этой схеме при разработке.**

---

## Схема работы

Разработка ведётся **на сервере** через Cursor Remote-SSH. Используется dev-режим с hot reload — без полного билда при каждом изменении. Коммит и пуш только после успешной проверки.

---

## Цикл разработки

### 1. Запуск dev-режима

```bash
cd /home/ubuntu/handyseller-repo
npm run dev:start
```

Что происходит:
- Останавливаются prod-контейнеры (API, Web)
- Запускаются API (`nest start --watch`) и Web (`next dev`) с hot reload
- Приложение доступно по https://app.handyseller.ru

### 2. Разработка

- Редактируй код в Cursor
- Сохраняй — изменения подхватываются автоматически
- Проверяй в браузере (app.handyseller.ru)
- Логи: `tail -f .dev-api.log` и `tail -f .dev-web.log`

### 3. Когда готово — коммит и пуш

```bash
git add .
git commit -m "fix(scope): описание"
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_github -o StrictHostKeyChecking=no" git push origin main
```

### 4. Возврат prod

```bash
npm run dev:stop
```

Prod (Docker) снова обслуживает пользователей.

---

## Важно

| Правило | Пояснение |
|---------|-----------|
| **Не коммитить без проверки** | Сначала убедись, что всё работает в dev |
| **Не патчить dist/** | Менять только `apps/api/src/`, `apps/web/`, `prisma/` |
| **dev:stop перед завершением** | Если закончил сессию — верни prod |
| **Одна БД** | Dev использует ту же БД, что и prod. Осторожно с тестами |

---

## Команды — шпаргалка

```bash
# Запуск dev
npm run dev:start

# Остановка dev, возврат prod
npm run dev:stop

# Логи API
tail -f .dev-api.log

# Логи Web
tail -f .dev-web.log
```

---

## Порты

- **API:** 4000
- **Web:** 3001
- **Redis (dev):** 6379

Nginx проксирует app.handyseller.ru на эти порты.

---

## Если что-то пошло не так

- **Порты заняты:** `fuser -k 4000/tcp` и `fuser -k 3001/tcp`
- **Prod не вернулся:** `cd /opt/handyseller && docker compose -f docker-compose.prod.yml --env-file .env.production up -d`
- **API не стартует:** проверь `apps/api/.env`, DATABASE_URL, REDIS_HOST=localhost
