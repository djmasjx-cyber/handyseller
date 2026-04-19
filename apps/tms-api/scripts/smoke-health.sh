#!/usr/bin/env bash
set -euo pipefail
# Быстрая проверка: собрать tms-api, поднять на ephemeral-порту, GET /health, завершить процесс.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
npm run build --silent
PORT="${PORT:-14105}"
export NODE_ENV="${NODE_ENV:-test}"
node dist/apps/tms-api/src/main.js &
PID=$!
cleanup() {
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
}
trap cleanup EXIT
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT}/health" | grep -q '"ok"'; then
    echo "tms-api smoke: /health OK (port ${PORT})"
    exit 0
  fi
  sleep 0.25
done
echo "tms-api smoke: /health failed on port ${PORT}" >&2
exit 1
