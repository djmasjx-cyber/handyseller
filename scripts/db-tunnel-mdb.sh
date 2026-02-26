#!/bin/bash
# SSH-туннель к Yandex Managed PostgreSQL через VM в той же VPC.
# Использование: ./scripts/db-tunnel-mdb.sh
#
# Требуется в .env.secrets:
#   VM_HOST, DEPLOY_SSH_KEY
#   YANDEX_MDB_HOST, YANDEX_MDB_PASSWORD, YANDEX_MDB_USER (по умолчанию handyseller_user)
#
# VM должна быть в той же VPC, что и Managed PostgreSQL.

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

VM_HOST="${VM_HOST:?Укажите VM_HOST в .env.secrets}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/yandex_vm}"
MDB_HOST="${YANDEX_MDB_HOST:?Укажите YANDEX_MDB_HOST в .env.secrets}"
MDB_PASSWORD="${YANDEX_MDB_PASSWORD:?Укажите YANDEX_MDB_PASSWORD в .env.secrets}"
MDB_USER="${YANDEX_MDB_USER:-handyseller_user}"
LOCAL_PORT="${DB_MDB_LOCAL_PORT:-5434}"
REMOTE_PORT=6432

if [ ! -f "$SSH_KEY" ]; then
  echo "Ошибка: SSH-ключ не найден. Укажите DEPLOY_SSH_KEY в .env.secrets"
  exit 1
fi

echo "==> Туннель к Yandex Managed PostgreSQL"
echo "    localhost:${LOCAL_PORT} → ${VM_HOST} → ${MDB_HOST}:${REMOTE_PORT}"
echo ""
echo "    Connection string:"
echo "    postgresql://${MDB_USER}:\$YANDEX_MDB_PASSWORD@localhost:${LOCAL_PORT}/handyseller?sslmode=require"
echo ""
echo "    Prisma Studio:"
echo "    DATABASE_URL=\"postgresql://${MDB_USER}:\$YANDEX_MDB_PASSWORD@localhost:${LOCAL_PORT}/handyseller?sslmode=require\" npx prisma studio"
echo ""
echo "    Ctrl+C — остановить туннель"
echo ""

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  -L "${LOCAL_PORT}:${MDB_HOST}:${REMOTE_PORT}" -N "${VM_USER}@${VM_HOST}"
