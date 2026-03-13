#!/bin/bash
# Запуск dev через PM2: API 4001, Web 3002. Prod (Docker 4000/3001) не затрагивается.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

API_PORT="${API_PORT:-4001}"
WEB_PORT="${WEB_PORT:-3002}"

# Защита: не запускать из /opt/handyseller (prod)
if [[ "$ROOT" == /opt/handyseller* ]]; then
  echo "Ошибка: не запускайте dev из prod-директории. Используйте /home/ubuntu/handyseller-repo"
  exit 1
fi

# Остановить предыдущий dev
"$ROOT/scripts/dev-stop-parallel.sh" 2>/dev/null || true

# Redis для dev (отдельный контейнер, prod Redis в Docker не трогаем)
export REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
docker start handyseller-redis-dev 2>/dev/null || \
  docker run -d --name handyseller-redis-dev -p 6379:6379 redis:7-alpine 2>/dev/null || true
sleep 1

# .env для API (если нет)
if [ ! -f "$ROOT/apps/api/.env" ]; then
  echo "==> Создание apps/api/.env (дефолты для dev)..."
  DATABASE_URL="${DATABASE_URL:-postgresql://handyseller:handyseller_secret_change_me@localhost:5432/handyseller}"
  JWT_SECRET="${JWT_SECRET:-dev-jwt-secret-min-32-chars-change-in-prod}"
  ENCRYPTION_KEY="${ENCRYPTION_KEY:-dev-encryption-key-min-32-chars-change}"
  cat > "$ROOT/apps/api/.env" << ENVEOF
DATABASE_URL=$DATABASE_URL
PORT=$API_PORT
NODE_ENV=development
REDIS_HOST=$REDIS_HOST
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
ENVEOF
fi

# PM2: запуск dev-приложений
echo "==> Запуск dev через PM2 (API $API_PORT, Web $WEB_PORT)..."
npx pm2 start ecosystem.dev.config.cjs

echo ""
echo "Dev API:  http://localhost:$API_PORT"
echo "Dev Web:  http://localhost:$WEB_PORT"
echo "Логи:     tail -f /tmp/handyseller-dev-api.log"
echo "Статус:   npx pm2 status"
echo "Остановка: npm run dev:parallel:stop"
