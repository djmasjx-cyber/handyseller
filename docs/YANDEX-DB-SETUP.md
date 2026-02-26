# Подключение к Yandex Managed PostgreSQL — готово

## Что сделано

1. **SSH-ключ добавлен на VM** через `yc compute instance add-metadata`
2. **Обновлён `.env.secrets`** — `VM_HOST`, `YANDEX_MDB_*`
3. **Скрипты** `connect-db.sh mdb`, `db-tunnel-mdb.sh`, `connect-mdb-full.sh`

## Подключение (с MacBook)

```bash
# Вариант 1: сразу psql или Prisma Studio (скрипт сам поднимет туннель)
./scripts/connect-db.sh mdb        # psql
./scripts/connect-db.sh mdb studio # Prisma Studio (GUI)

# Вариант 2: туннель в отдельном терминале
# Терминал 1:
./scripts/db-tunnel-mdb.sh

# Терминал 2:
cd apps/api
DATABASE_URL="postgresql://handyseller_user:ПАРОЛЬ@localhost:5434/handyseller?sslmode=require" npx prisma studio
```

## Миграции

```bash
./scripts/connect-mdb-full.sh migrate
```

## API на VM (production)

В `apps/api/.env` на VM:

```
DATABASE_URL=postgresql://handyseller_user:PASSWORD@rc1a-5n1ok7rb7ukbemv7.mdb.yandexcloud.net:6432/handyseller?sslmode=require
```

(Пароль — из `infra/terraform/terraform.tfvars`)

## Примечание

Managed PostgreSQL без публичного IP — доступ только из VPC. С локальной машины нужен SSH-туннель через VM.
