#!/bin/bash
# SSH-туннель к PostgreSQL на VM в Yandex Cloud.
# После запуска подключайтесь: psql "postgresql://handyseller:ПАРОЛЬ@localhost:5433/handyseller"
#
# Требуется в .env.secrets: VM_HOST, DEPLOY_SSH_KEY, POSTGRES_PASSWORD (см. .env.secrets.example)
# Использование: ./scripts/db-tunnel.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

VM_HOST="${VM_HOST:-158.160.209.158}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/yandex_vm}"
LOCAL_PORT="${DB_LOCAL_PORT:-5433}"
REMOTE_PORT=5432

if [ ! -f "$SSH_KEY" ]; then
  echo "Ошибка: SSH-ключ не найден. Укажите DEPLOY_SSH_KEY в .env.secrets"
  exit 1
fi

echo "==> Туннель: localhost:${LOCAL_PORT} → ${VM_HOST}:${REMOTE_PORT}"
echo "    Подключение: postgresql://handyseller:\$POSTGRES_PASSWORD@localhost:${LOCAL_PORT}/handyseller"
echo "    Для Prisma Studio: DATABASE_URL=\"postgresql://handyseller:\$POSTGRES_PASSWORD@localhost:${LOCAL_PORT}/handyseller\" npx prisma studio"
echo "    Ctrl+C — остановить туннель"
echo ""

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -L "${LOCAL_PORT}:localhost:${REMOTE_PORT}" -N "${VM_USER}@${VM_HOST}"
