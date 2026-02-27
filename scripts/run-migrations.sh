#!/bin/bash
# Выполнить миграции против БД.
# Вариант 1: Через туннель к Managed PostgreSQL
#   ./scripts/db-tunnel-mdb.sh   # в отдельном терминале
#   DATABASE_URL="postgresql://user:pass@localhost:5434/handyseller?sslmode=require" \
#     npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
#
# Вариант 2: При деплое — миграции выполняются автоматически при старте API.
#   Dockerfile CMD: npx prisma migrate deploy && node dist/src/main.js

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

if [ -z "$DATABASE_URL" ]; then
  if [ -n "$YANDEX_MDB_HOST" ] && [ -n "$YANDEX_MDB_PASSWORD" ]; then
    MDB_USER="${YANDEX_MDB_USER:-handyseller_user}"
    echo "Используя Yandex MDB. Запустите туннель в другом терминале:"
    echo "  ./scripts/db-tunnel-mdb.sh"
    echo ""
    echo "Затем:"
    echo "  DATABASE_URL=\"postgresql://${MDB_USER}:\$YANDEX_MDB_PASSWORD@localhost:\${DB_MDB_LOCAL_PORT:-5434}/handyseller?sslmode=require\" \\"
    echo "    npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma"
    exit 1
  fi
  echo "Ошибка: укажите DATABASE_URL или настройте .env.secrets (YANDEX_MDB_*)"
  exit 1
fi

cd "$ROOT/apps/api"
npx prisma migrate deploy --schema=./prisma/schema.prisma
echo "Миграции применены."
