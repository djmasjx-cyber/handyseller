# Облачная разработка — быстрый старт

Вся разработка на VM в Yandex Cloud, без локальной БД и туннелей.

## Одна команда (на MacBook)

```bash
cd handyseller-dev
npm run setup:cloud
```

Или:
```bash
./scripts/setup-cloud-dev.sh
```

## После настройки

1. **Cursor** → Cmd+Shift+P → **Remote-SSH: Connect to Host** → **handyseller**
2. **File** → **Open Folder** → `/home/ubuntu/handyseller-dev`
3. В терминале:
   - `npm run dev:api` — API на порту 4000
   - `npm run dev` — Web на порту 3000

## Доступ с MacBook

```bash
ssh -L 3000:localhost:3000 -L 4000:localhost:4000 handyseller
```

Затем в браузере: http://localhost:3000, http://localhost:4000

## База данных

- **Managed PostgreSQL** — если в `.env.secrets` есть `YANDEX_MDB_HOST`, API подключается напрямую (VM в той же VPC)
- **Docker на VM** — иначе используется PostgreSQL в Docker

## Синхронизация изменений

С MacBook после правок в коде:
```bash
./scripts/sync-to-remote.sh
```
