#!/bin/bash
# Диагностика на самой VM (SSH): bash scripts/vm-diagnose-api.sh
# Не выводит пароли из DATABASE_URL — только схема и хост.

set -e
echo "=== docker ps (handyseller*) ==="
docker ps -a --filter name=handyseller 2>/dev/null || sudo docker ps -a --filter name=handyseller

echo ""
echo "=== handyseller-api logs (last 100 lines) ==="
(docker logs handyseller-api --tail 100 2>&1 || sudo docker logs handyseller-api --tail 100 2>&1) || true

echo ""
echo "=== curl API /health ==="
curl -sS -m 5 -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:4000/health || echo "curl failed"

echo ""
echo "=== DATABASE_URL (redacted user/password) ==="
ENVF="${1:-/opt/handyseller/.env.production}"
if [ -f "$ENVF" ]; then
  grep -E '^DATABASE_URL=' "$ENVF" | sed -E 's|(postgresql://)[^:@/]+(:[^@]+)?(@)|\1***\3|g' || true
else
  echo "File not found: $ENVF"
fi

echo ""
echo "=== systemd handyseller-compose (if installed) ==="
systemctl is-enabled handyseller-compose 2>/dev/null || echo "unit missing or no permission"
