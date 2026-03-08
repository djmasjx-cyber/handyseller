#!/usr/bin/env bash
# Запуск dev-режима: останавливает prod (API + Web), запускает nest --watch и next dev.
# Порт API: 4000, Web: 3001 (nginx ожидает эти порты).
#
# Использование: ./scripts/dev-start.sh
# Остановить: ./scripts/dev-stop.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

PID_FILE="$ROOT/.dev-pids"

echo "==> HandySeller: запуск dev-режима"
echo ""

# 1. Остановить prod-контейнеры (API и Web)
echo "==> Остановка prod (API + Web)..."
docker stop handyseller-api handyseller-web 2>/dev/null || true
echo "    Готово."

# 2. Redis для dev (prod redis не пробрасывает порт — поднимаем свой)
echo "==> Redis для dev..."
docker start handyseller-redis-dev 2>/dev/null || \
  docker run -d --name handyseller-redis-dev -p 6379:6379 redis:7-alpine 2>/dev/null || true
sleep 1
echo "    Готово."

# 3. .env для API
if [ ! -f apps/api/.env ]; then
  echo "==> Создание apps/api/.env..."
  if [ -f /opt/handyseller/.env.production ]; then
    cp /opt/handyseller/.env.production apps/api/.env
    sed -i 's/NODE_ENV=production/NODE_ENV=development/' apps/api/.env
    sed -i 's/REDIS_HOST=redis/REDIS_HOST=localhost/' apps/api/.env
  else
    [ -f .env.secrets ] && set -a && . .env.secrets && set +a
    DATABASE_URL="${DATABASE_URL:-postgresql://handyseller:handyseller_secret_change_me@localhost:5432/handyseller}"
    JWT_SECRET="${JWT_SECRET:-dev-jwt-secret-min-32-chars-change-in-prod}"
    ENCRYPTION_KEY="${ENCRYPTION_KEY:-dev-encryption-key-min-32-chars-change}"
    cat > apps/api/.env << ENVEOF
DATABASE_URL=$DATABASE_URL
PORT=4000
NODE_ENV=development
REDIS_HOST=localhost
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
ENVEOF
  fi
  echo "    Создан."
fi

# 4. Убить старые dev-процессы на портах
echo "==> Освобождение портов 4000, 3001..."
fuser -k 4000/tcp 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
sleep 2

# 5. Запуск API (nest start --watch)
echo "==> Запуск API (nest start --watch) на порту 4000..."
cd "$ROOT/apps/api"
PORT=4000 nohup npm run dev > "$ROOT/.dev-api.log" 2>&1 &
API_PID=$!
echo $API_PID > "$PID_FILE"
cd "$ROOT"

# 6. Запуск Web (next dev) на порту 3001
echo "==> Запуск Web (next dev) на порту 3001..."
cd "$ROOT/apps/web"
PORT=3001 nohup npm run dev >> "$ROOT/.dev-web.log" 2>&1 &
WEB_PID=$!
echo $WEB_PID >> "$PID_FILE"
cd "$ROOT"

# 7. Ждём готовности
echo ""
echo "Ожидание API (до 30 сек)..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:4000/health >/dev/null 2>&1; then
    echo "    API готов (попытка $i)"
    break
  fi
  sleep 1
done

echo ""
echo "=== Dev-режим запущен ==="
echo "  API:  http://127.0.0.1:4000  (логи: tail -f .dev-api.log)"
echo "  Web:  http://127.0.0.1:3001 (логи: tail -f .dev-web.log)"
echo ""
echo "  Nginx проксирует app.handyseller.ru → localhost:4000, :3001"
echo "  Изменения в коде подхватываются автоматически (hot reload)"
echo ""
echo "  Остановить: ./scripts/dev-stop.sh"
echo ""
