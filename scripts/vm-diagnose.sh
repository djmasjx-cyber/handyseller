#!/bin/bash
# Диагностика 502 Bad Gateway. Запуск на VM: bash /opt/handyseller/vm-diagnose.sh
# Или: ssh ubuntu@VM_IP "bash -s" < scripts/vm-diagnose.sh

set -e
echo "=== 1. Docker containers ==="
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== 2. Ports 4000, 3001 ==="
ss -tlnp | grep -E '4000|3001' || true

echo ""
echo "=== 3. API health ==="
curl -sf --connect-timeout 3 http://127.0.0.1:4000/health && echo " OK" || echo " FAIL"

echo ""
echo "=== 4. Web root ==="
curl -sf --connect-timeout 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/ && echo "" || echo " FAIL"

echo ""
echo "=== 5. Nginx config ==="
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || true
sudo nginx -t 2>&1 || true

echo ""
echo "=== 6. API logs (last 40 lines) ==="
docker logs handyseller-api --tail 40 2>&1 || true

echo ""
echo "=== 7. Web logs (last 20 lines) ==="
docker logs handyseller-web --tail 20 2>&1 || true

echo ""
echo "=== 8. Redis ==="
docker exec handyseller-redis redis-cli ping 2>/dev/null && echo " OK" || echo " FAIL or not running"
