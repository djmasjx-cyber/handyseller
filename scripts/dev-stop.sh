#!/usr/bin/env bash
# Остановка dev-режима и запуск prod (Docker).
#
# Использование: ./scripts/dev-stop.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$ROOT/.dev-pids"

echo "==> HandySeller: остановка dev, запуск prod"
echo ""

# 1. Убить dev-процессы по PID
if [ -f "$PID_FILE" ]; then
  echo "==> Остановка dev-процессов..."
  while read -r pid; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done < "$PID_FILE"
  rm -f "$PID_FILE"
  echo "    Готово."
fi

# 2. Дополнительно — по портам (на случай если PID-файл потерян)
echo "==> Освобождение портов 4000, 3001..."
fuser -k 4000/tcp 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
sleep 2

# 3. Остановить redis-dev если был запущен
docker stop handyseller-redis-dev 2>/dev/null || true
docker rm handyseller-redis-dev 2>/dev/null || true

# 4. Запуск prod (Docker)
echo "==> Запуск prod (Docker)..."
if [ -d /opt/handyseller ]; then
  cd /opt/handyseller
  docker compose -f docker-compose.prod.yml --env-file .env.production up -d
  echo "    Prod запущен из /opt/handyseller"
else
  cd "$ROOT"
  if [ -f docker-compose.prod.yml ] && [ -f .env.production ]; then
    docker compose -f docker-compose.prod.yml --env-file .env.production up -d
    echo "    Prod запущен из $ROOT"
  else
    echo "    Внимание: /opt/handyseller не найден. Запустите деплой вручную."
  fi
fi

echo ""
echo "=== Prod запущен ==="
echo "  API:  http://127.0.0.1:4000"
echo "  Web:  http://127.0.0.1:3001"
echo ""
