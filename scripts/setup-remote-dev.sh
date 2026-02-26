#!/bin/bash
# Первоначальная настройка проекта на сервере для Remote-SSH разработки.
# Запуск: ./scripts/setup-remote-dev.sh
# Требуется: DEPLOY_SSH_KEY, VM_HOST (или из .env.secrets)
#
# После выполнения:
# 1. Подключитесь в Cursor: Remote-SSH → handyseller
# 2. Откройте папку ~/handyseller-dev
# 3. Можно удалить локальную копию (освободит место)

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

VM_HOST="${VM_HOST:-158.160.209.158}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/yandex_vm}"
REMOTE_DIR="${REMOTE_DEV_DIR:-handyseller-dev}"

if [ ! -f "$SSH_KEY" ]; then
  echo "Ошибка: SSH-ключ не найден. Укажите DEPLOY_SSH_KEY или создайте $HOME/.ssh/yandex_vm"
  exit 1
fi

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

echo "==> Remote dev setup: $VM_USER@$VM_HOST:~/$REMOTE_DIR"
echo ""

# 1. Rsync исходников (без node_modules, .next, dist)
echo "==> Синхронизация проекта на сервер..."
rsync -avz --progress \
  -e "ssh $SSH_OPTS" \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'out' \
  --exclude 'apps/*/dist' \
  --exclude 'apps/*/.next' \
  --exclude '*.tsbuildinfo' \
  --exclude '.deploy-tmp' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.env.production' \
  "$ROOT/" "${VM_USER}@${VM_HOST}:~/${REMOTE_DIR}/"

# 2. Копируем .env.secrets если есть (для API, WB, Ozon и т.д.)
if [ -f "$ROOT/.env.secrets" ]; then
  echo "==> Копирование .env.secrets..."
  scp $SSH_OPTS "$ROOT/.env.secrets" "${VM_USER}@${VM_HOST}:~/${REMOTE_DIR}/"
else
  echo "==> .env.secrets не найден. Создайте его на сервере вручную."
fi

# 3. На сервере: npm install, env, prisma generate
echo "==> Установка зависимостей на сервере..."
ssh $SSH_OPTS ${VM_USER}@${VM_HOST} bash -s "$REMOTE_DIR" << 'ENDSSH'
set -e
REMOTE_DIR="${1:-handyseller-dev}"
cd ~/"$REMOTE_DIR"

# Node.js
if ! command -v node &>/dev/null; then
  echo "Установка Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# npm install (корень + workspaces)
npm install

# API: .env — из production если есть, иначе из .env.secrets (Managed PostgreSQL или Docker на VM)
if [ -f /opt/handyseller/.env.production ]; then
  cp /opt/handyseller/.env.production apps/api/.env
  sed -i 's/NODE_ENV=production/NODE_ENV=development/' apps/api/.env
else
  [ -f .env.secrets ] && set -a && . .env.secrets && set +a
  if [ -n "$YANDEX_MDB_HOST" ] && [ -n "$YANDEX_MDB_PASSWORD" ]; then
    MDB_USER="${YANDEX_MDB_USER:-handyseller_user}"
    DATABASE_URL="postgresql://${MDB_USER}:${YANDEX_MDB_PASSWORD}@${YANDEX_MDB_HOST}:6432/handyseller?sslmode=require"
  else
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-handyseller_prod_change_me}"
    DATABASE_URL="postgresql://handyseller:${POSTGRES_PASSWORD}@localhost:5432/handyseller"
  fi
  JWT_SECRET="${JWT_SECRET:-dev-jwt-secret-min-32-chars-change-in-prod}"
  ENCRYPTION_KEY="${ENCRYPTION_KEY:-dev-encryption-key-min-32-chars-change}"
  cat > apps/api/.env << ENVEOF
DATABASE_URL=$DATABASE_URL
PORT=4000
NODE_ENV=development
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
ENVEOF
fi

# Prisma
cd apps/api
npm run prisma:generate -- --schema=./prisma/schema.prisma
cd ../..

echo ""
echo "Готово! Подключитесь в Cursor: Remote-SSH → handyseller, откройте ~/$REMOTE_DIR"
ENDSSH

echo ""
echo "==> Готово. Дальше:"
echo "  1. Cursor: Cmd+Shift+P → Remote-SSH: Connect to Host → handyseller"
echo "  2. File → Open Folder → /home/$VM_USER/$REMOTE_DIR"
echo "  3. Терминал: npm run dev:api (в одном), npm run dev (в другом)"
echo ""
echo "  Для повторной синхронизации: ./scripts/sync-to-remote.sh"
echo ""
