#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-4200}"
npm run build --workspace=wms-api >/tmp/wms-api-build.log
node dist/apps/wms-api/src/main.js >/tmp/wms-api-smoke.log 2>&1 &
pid=$!
trap 'kill "$pid" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${PORT}/health" | grep -q '"ok":true'; then
    echo "wms-api health ok"
    exit 0
  fi
  sleep 1
done

echo "wms-api health failed" >&2
cat /tmp/wms-api-smoke.log >&2 || true
exit 1
