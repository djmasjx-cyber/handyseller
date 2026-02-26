#!/bin/bash
# Запуск API с Managed PostgreSQL (без локальной БД)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a
MDB_USER="${YANDEX_MDB_USER:-handyseller_user}"
export DATABASE_URL="postgresql://${MDB_USER}:${YANDEX_MDB_PASSWORD}@${YANDEX_MDB_HOST}:6432/handyseller?sslmode=require"
cd "$ROOT" && npm run dev:api
