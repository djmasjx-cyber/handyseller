#!/bin/bash
# Остановка dev (только PM2-приложения). Prod (Docker) не затрагивается.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Останавливаем только dev-приложения по имени
npx pm2 delete handyseller-dev-api 2>/dev/null || true
npx pm2 delete handyseller-dev-web 2>/dev/null || true

# Запасной вариант: освободить порты 4001, 3002 (не 4000, 3001 — prod!)
for port in 4001 3002; do
  pid=$(lsof -ti:$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null || true
    echo "Освобождён порт $port"
  fi
done

echo "Dev остановлен."
