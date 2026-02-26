#!/bin/bash
# Полный цикл: туннель + подключение к Yandex Managed PostgreSQL
# Запускать на MacBook (где работает SSH к VM)
#
# Использование:
#   ./scripts/connect-mdb-full.sh         — psql
#   ./scripts/connect-mdb-full.sh studio  — Prisma Studio
#   ./scripts/connect-mdb-full.sh migrate — применить миграции

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -f ".env.secrets" ] && set -a && . .env.secrets && set +a

export DATABASE_URL="postgresql://${YANDEX_MDB_USER:-handyseller_user}:${YANDEX_MDB_PASSWORD}@localhost:${DB_MDB_LOCAL_PORT:-5434}/handyseller?sslmode=require"

case "${1:-psql}" in
  studio)
    ./scripts/connect-db.sh mdb studio
    ;;
  migrate)
    # Туннель в фоне, миграции
    ./scripts/db-tunnel-mdb.sh &
    sleep 5
    cd apps/api && npx prisma migrate deploy
    echo "Туннель продолжает работать в фоне. Ctrl+C в том терминале — остановить."
    ;;
  psql|*)
    ./scripts/connect-db.sh mdb
    ;;
esac
