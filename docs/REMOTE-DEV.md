# Разработка через Remote-SSH (Yandex Cloud)

Работа с проектом напрямую на сервере — экономия места и памяти на локальной машине.

## Шаг 1. SSH config

Добавьте в `~/.ssh/config`:

```
Host handyseller
  HostName 158.160.209.158
  User ubuntu
  IdentityFile ~/.ssh/yandex_vm
  ServerAliveInterval 60
```

Замените `158.160.209.158` на IP вашей VM (из `yc compute instance list` или `full-deploy.sh`).

## Шаг 2. Первоначальная настройка (один раз)

С MacBook (где есть SSH к VM):

```bash
cd handyseller-dev
./scripts/setup-cloud-dev.sh
```

Или по отдельности:
```bash
./scripts/setup-remote-dev.sh
```

Скрипт:
- добавляет `handyseller` в `~/.ssh/config`
- синхронизирует исходники на сервер в `~/handyseller-dev`
- копирует `.env.secrets`
- устанавливает `npm install`
- настраивает `apps/api/.env` (Managed PostgreSQL или Docker на VM)

## Шаг 3. Подключение в Cursor

1. **Cmd+Shift+P** → **Remote-SSH: Connect to Host...**
2. Выберите **handyseller**
3. После подключения: **File → Open Folder** → `/home/ubuntu/handyseller-dev`
4. Cursor откроет проект на сервере

## Шаг 4. Запуск dev-серверов

В терминале Cursor (уже на сервере):

```bash
# Терминал 1 — API
npm run dev:api

# Терминал 2 — Web
npm run dev
```

API: `http://localhost:4000`, Web: `http://localhost:3000`.  
Для доступа снаружи — проброс портов или nginx (см. ниже).

## Полезные команды

| Действие | Команда |
|----------|---------|
| Повторная синхронизация с локальной машины | `./scripts/sync-to-remote.sh` |
| Prisma migrate | `cd apps/api && npx prisma migrate dev` |
| Сборка для деплоя | `npm run build` |
| Деплой на production | `./scripts/full-deploy.sh` (с локальной машины) |

## База данных

Dev-окружение использует ту же PostgreSQL, что и production (Docker на VM).  
`DATABASE_URL` берётся из `/opt/handyseller/.env.production` или из `.env.secrets`.

## Освобождение места локально

После успешной настройки Remote-SSH можно удалить локальную копию:

```bash
# Удалить проект (осторожно!)
rm -rf /path/to/handyseller
```

Рекомендуется сначала закоммитить и запушить изменения в git.

## Деплой с удалённой машины

Если проект только на сервере, деплой можно запускать оттуда:

```bash
# На сервере в ~/handyseller-dev
# Нужны .env.secrets с ADMIN_EMAIL, ADMIN_PASSWORD и т.д.
./scripts/full-deploy.sh
```

Для этого `VM_HOST` должен указывать на саму себя или на другую VM.  
Обычно деплой удобнее запускать с локальной машины (где есть yc CLI и ключи).

## Порты и доступ снаружи

- **3000** — Web (Next.js)
- **4000** — API (NestJS)

Production использует nginx на 3000, проксирующий на API и Web.  
Для dev можно временно пробросить порты через SSH:

```bash
ssh -L 3000:localhost:3000 -L 4000:localhost:4000 handyseller
```

Затем открыть `http://localhost:3000` в браузере на Mac.
