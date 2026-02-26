#!/bin/bash
# Подключение к БД HandySeller: psql или Prisma Studio через SSH-туннель.
#
# Использование:
#   ./scripts/connect-db.sh         — интерактивный psql (PostgreSQL на VM)
#   ./scripts/connect-db.sh studio  — Prisma Studio
#   ./scripts/connect-db.sh exec "SELECT 1" — выполнить SQL
#   ./scripts/connect-db.sh mdb     — psql к Yandex Managed PostgreSQL
#   ./scripts/connect-db.sh mdb studio — Prisma Studio к Managed PostgreSQL

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

VM_HOST="${VM_HOST:-158.160.209.158}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/yandex_vm}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-handyseller_prod_change_me}"
LOCAL_PORT="${DB_LOCAL_PORT:-5433}"
MDB_HOST="${YANDEX_MDB_HOST:-}"
MDB_PASSWORD="${YANDEX_MDB_PASSWORD:-}"
MDB_USER="${YANDEX_MDB_USER:-handyseller_user}"
MDB_LOCAL_PORT="${DB_MDB_LOCAL_PORT:-5434}"

if [ ! -f "$SSH_KEY" ]; then
  echo "Ошибка: SSH-ключ не найден. Добавьте DEPLOY_SSH_KEY в .env.secrets"
  exit 1
fi

USE_MDB=0
MODE="${1:-psql}"
if [ "$MODE" = "mdb" ]; then
  USE_MDB=1
  MODE="${2:-psql}"
fi
if [ "$MODE" = "mdb" ]; then
  MODE=psql
fi

if [ "$USE_MDB" = "1" ]; then
  if [ -z "$MDB_HOST" ] || [ -z "$MDB_PASSWORD" ]; then
    echo "Ошибка: для Managed PostgreSQL укажите YANDEX_MDB_HOST и YANDEX_MDB_PASSWORD в .env.secrets"
    exit 1
  fi
  DATABASE_URL="postgresql://${MDB_USER}:${MDB_PASSWORD}@localhost:${MDB_LOCAL_PORT}/handyseller?sslmode=require"
  TUNNEL_PORT="$MDB_LOCAL_PORT"
  REMOTE_TARGET="${MDB_HOST}:6432"
else
  DATABASE_URL="postgresql://handyseller:${POSTGRES_PASSWORD}@localhost:${LOCAL_PORT}/handyseller"
  TUNNEL_PORT="$LOCAL_PORT"
fi

# Проверяем, слушается ли порт (туннель уже запущен?)
TUNNEL_UP=0
if command -v nc &>/dev/null && nc -z localhost "$TUNNEL_PORT" 2>/dev/null; then
  TUNNEL_UP=1
fi

if [ "$TUNNEL_UP" != "1" ]; then
  echo "==> Запуск SSH-туннеля в фоне..."
  if [ "$USE_MDB" = "1" ]; then
    ssh -f -i "$SSH_KEY" -o StrictHostKeyChecking=no \
      -L "${TUNNEL_PORT}:${MDB_HOST}:6432" -N "${VM_USER}@${VM_HOST}"
    echo "    Туннель: localhost:${TUNNEL_PORT} → ${VM_HOST} → ${MDB_HOST}:6432"
  else
    ssh -f -i "$SSH_KEY" -o StrictHostKeyChecking=no \
      -L "${TUNNEL_PORT}:localhost:5432" -N "${VM_USER}@${VM_HOST}"
    echo "    Туннель: localhost:${TUNNEL_PORT} → ${VM_HOST}:5432"
  fi
  sleep 2
  echo ""
fi
if [ "$MODE" != "studio" ] && ! command -v psql &>/dev/null; then
  echo "psql не найден. Установите PostgreSQL client или используйте: $0 studio (Prisma Studio)"
  exit 1
fi
case "$MODE" in
  studio)
    echo "==> Запуск Prisma Studio..."
    cd "$ROOT/apps/api"
    DATABASE_URL="$DATABASE_URL" npx prisma studio
    ;;
  exec)
    echo "==> Выполнение SQL..."
    echo "$2" | psql "$DATABASE_URL"
    ;;
  psql|*)
    echo "==> Подключение к БД (psql)..."
    psql "$DATABASE_URL"
    ;;
esac
