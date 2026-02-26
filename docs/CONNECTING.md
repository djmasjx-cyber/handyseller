# Подключение к сервисам HandySeller (Yandex Cloud)

Руководство для разработчиков: как подключаться к БД, Redis и другим сервисам.

---

## 1. База данных PostgreSQL

### Архитектура

| Среда | Где БД | Доступ |
|-------|--------|--------|
| **Production (VM)** | Docker на VM, localhost:5432 | Прямой с VM |
| **Локальная машина** | Через SSH-туннель на VM | `./scripts/connect-db.sh` |

### Быстрый старт (локально)

```bash
# 1. Настройте .env.secrets (см. раздел «Конфигурация»)
# 2. Подключиться к БД (скрипт сам поднимет туннель)
./scripts/connect-db.sh

# Или Prisma Studio (GUI)
./scripts/connect-db.sh studio
```

### Туннель в отдельном терминале

Если нужно держать туннель открытым и подключаться разными клиентами:

```bash
# Терминал 1: туннель (оставить запущенным)
./scripts/db-tunnel.sh

# Терминал 2: psql, Prisma Studio, debug-скрипты и т.д.
export DATABASE_URL="postgresql://handyseller:$POSTGRES_PASSWORD@localhost:5433/handyseller"
cd apps/api && npm run debug:wb-order
```

### Debug-скрипты (WB, Ozon)

Для `npm run debug:wb-order` с БД нужны `DATABASE_URL` и `ENCRYPTION_KEY`. С туннелем:

```bash
./scripts/db-tunnel.sh &   # в фоне
sleep 2
# Скопируйте ENCRYPTION_KEY из /opt/handyseller/.env.production на VM (или из .encryption-key)
cd apps/api
DATABASE_URL="postgresql://handyseller:ПАРОЛЬ@localhost:5433/handyseller" \
ENCRYPTION_KEY="ваш_ключ" \
EMAIL=nmanoilo@ya.ru ORDER_ID=4645532575 npm run debug:wb-order
```

Либо выполняйте скрипт на VM, где уже есть доступ к БД и ключам.

### Выполнение миграций

С туннелем (локально):

```bash
./scripts/db-tunnel.sh &   # в фоне
sleep 2
cd apps/api
DATABASE_URL="postgresql://handyseller:ПАРОЛЬ@localhost:5433/handyseller" npx prisma migrate deploy
```

Или напрямую на VM:

```bash
ssh -i ~/.ssh/yandex_vm ubuntu@158.160.209.158
cd /opt/handyseller/apps/api
set -a && . /opt/handyseller/.env.production && set +a
npx prisma migrate deploy
```

---

## 2. Redis

Redis запущен в Docker на VM (localhost:6379). С локальной машины — только через SSH-туннель.

```bash
# Туннель для Redis
ssh -i ~/.ssh/yandex_vm -L 6379:localhost:6379 -N ubuntu@158.160.209.158
```

---

## 3. Yandex Managed PostgreSQL (опционально)

Если используется Managed PostgreSQL в Yandex Cloud вместо Docker на VM:

- Доступ только из VPC (кластер без публичного IP)
- **С локальной машины:** SSH-туннель через VM в той же VPC

### Быстрый старт (Managed PostgreSQL)

1. Добавьте в `.env.secrets`:
   ```
   YANDEX_MDB_HOST=rc1a-xxxxx.mdb.yandexcloud.net   # terraform output postgresql_host
   YANDEX_MDB_PASSWORD=пароль_из_terraform_tfvars
   YANDEX_MDB_USER=handyseller_user
   ```

2. Подключиться:
   ```bash
   ./scripts/connect-db.sh mdb        # psql
   ./scripts/connect-db.sh mdb studio # Prisma Studio
   ```

3. Или туннель в отдельном терминале:
   ```bash
   ./scripts/db-tunnel-mdb.sh
   # В другом терминале:
   DATABASE_URL="postgresql://handyseller_user:PASSWORD@localhost:5434/handyseller?sslmode=require" npx prisma studio
   ```

### Connection string (прямой доступ с VM в VPC)

`postgresql://handyseller_user:PASSWORD@HOST.mdb.yandexcloud.net:6432/handyseller?sslmode=require`

Подробности: [infra/yandex-cloud/database/README.md](../infra/yandex-cloud/database/README.md)

---

## 4. Конфигурация (.env.secrets)

Создайте `.env.secrets` в корне проекта (файл в .gitignore):

```bash
# === Обязательно для деплоя ===
ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD="secure-password"

# === Подключение к VM и БД ===
VM_HOST=158.160.209.158
DEPLOY_SSH_KEY=$HOME/.ssh/yandex_vm
POSTGRES_PASSWORD=handyseller_prod_change_me

# Опционально: порт для туннеля (по умолчанию 5433)
# DB_LOCAL_PORT=5433

# === Yandex Managed PostgreSQL (для connect-db.sh mdb, db-tunnel-mdb.sh) ===
# YANDEX_MDB_HOST=rc1a-xxxxx.mdb.yandexcloud.net   # terraform output postgresql_host
# YANDEX_MDB_PASSWORD=пароль_из_terraform_tfvars

# === ВТБ Эквайринг (опционально) ===
# VTB_USER_NAME=...
# VTB_PASSWORD=...
# VTB_MODE=sandbox
```

**Важно:** Пароль `POSTGRES_PASSWORD` должен совпадать с тем, что указан при деплое (в `.env.production` на VM).

---

## 5. Полезные команды

| Действие | Команда |
|----------|---------|
| Подключиться к БД | `./scripts/connect-db.sh` |
| Prisma Studio | `./scripts/connect-db.sh studio` |
| Туннель (ручной режим) | `./scripts/db-tunnel.sh` |
| Managed PostgreSQL (psql) | `./scripts/connect-db.sh mdb` |
| Managed PostgreSQL (Prisma Studio) | `./scripts/connect-db.sh mdb studio` |
| Туннель к Managed DB | `./scripts/db-tunnel-mdb.sh` |
| Debug WB заказа | `EMAIL=... ORDER_ID=... npm run debug:wb-order --workspace=api` |
| SSH на VM | `ssh -i ~/.ssh/yandex_vm ubuntu@158.160.209.158` |

---

## 6. Troubleshooting

### «Connection refused» при подключении к localhost:5433

1. Запущен ли туннель? `./scripts/db-tunnel.sh` (в отдельном терминале)
2. Проверьте SSH: `ssh -i ~/.ssh/yandex_vm ubuntu@158.160.209.158 echo OK`
3. На VM ли PostgreSQL: `ssh ... docker ps | grep postgres`

### «Permission denied» для SSH-ключа

```bash
chmod 600 ~/.ssh/yandex_vm
```

### Неверный пароль БД

Пароль хранится на VM в `/opt/handyseller/.env.production` (переменная `POSTGRES_PASSWORD`). Убедитесь, что в `.env.secrets` указано то же значение.
